import "server-only";
import { aiConfigured, aiErrorMessage, completeAnswer, streamAnswer } from "@/lib/ai/claude";
import { getViewer, type Viewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { CaseRow } from "@/lib/types";

// Shared by the /api/ai/* routes: the same checks, rate limit and streaming for every AI tool.

export const aiJson = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCaseId = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

/** Signed in, a role with AI tools, and a key on the server — or the error response to send. */
export async function aiViewer(): Promise<Viewer | Response> {
  const v = await getViewer();
  if (!v) return aiJson(401, "Sign in to use the AI tools.");
  if (!can(v.role, "ai")) return aiJson(403, "AI tools are for students, lecturers and the builder.");
  if (!aiConfigured()) return aiJson(503, "AI is offline — the built-in case file still works.");
  return v;
}

/** Read JSON, or null for a body that isn't an object. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b: unknown = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Read the case as this user (RLS) and take one AI token (20 per rolling hour) in one transaction.
 * Returns the case, or the error response to send (404 not visible, 429 over the limit).
 */
export async function gateCase(v: Viewer, caseId: string, task: string): Promise<CaseRow | Response> {
  const gate = await withUser(v.id, async (tx) => {
    const [c] = await tx<CaseRow[]>`
      select id, code, name, jurisdiction, focus, overview, original_verdict, latest_outcome,
             needs_verify, owner_id, class_id, updated_at
      from cases where id = ${caseId}`;
    if (!c) return { c: null, allowed: false, retryAt: null };
    const [t] = await tx<{ allowed: boolean; retry_at: Date | null }[]>`select * from ai_take_token(${task})`;
    return { c, allowed: t.allowed, retryAt: t.retry_at };
  });
  if (!gate.c) return aiJson(404, "Case not found.");
  if (!gate.allowed) {
    return aiJson(429, "You've used your 20 AI requests for this hour.", { retryAt: gate.retryAt?.toISOString() ?? null });
  }
  return gate.c;
}

/** Gate (see gateCase), then stream Claude's answer to `prompt(case)` as plain text. */
export async function streamCaseAnswer(
  req: Request,
  v: Viewer,
  caseId: string,
  task: string,
  prompt: (c: CaseRow) => string,
): Promise<Response> {
  const c = await gateCase(v, caseId, task);
  if (c instanceof Response) return c;
  return streamText(req, task, prompt(c));
}

/** For AI tools not tied to a case (Features ideas): take one AI token, then stream. */
export async function streamPlainAnswer(req: Request, v: Viewer, task: string, prompt: string): Promise<Response> {
  const [t] = await withUser(v.id, (tx) => tx<{ allowed: boolean; retry_at: Date | null }[]>`select * from ai_take_token(${task})`);
  if (!t.allowed) return aiJson(429, "You've used your 20 AI requests for this hour.", { retryAt: t.retry_at?.toISOString() ?? null });
  return streamText(req, task, prompt);
}

async function streamText(req: Request, task: string, prompt: string): Promise<Response> {
  const answer = streamAnswer(prompt, req.signal);
  // Wait for the first chunk so a rejected request becomes a clear error, not an empty stream.
  let first: IteratorResult<string>;
  try {
    first = await answer.next();
  } catch (e) {
    const { status, message } = aiErrorMessage(e);
    if (status >= 500) console.error(`AI ${task} failed`, e);
    return aiJson(status, message);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(enc.encode(first.value));
        for (let r = await answer.next(); !r.done; r = await answer.next()) controller.enqueue(enc.encode(r.value));
      } catch (e) {
        const { message } = aiErrorMessage(e);
        if (!req.signal.aborted) {
          console.error(`AI ${task} stream failed`, e);
          controller.enqueue(enc.encode(`\n\n[Stopped: ${message}]`));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      void answer.return(undefined);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/** Gate (see gateCase), then Claude's whole answer to `prompt(case)` passed to `handle` — for JSON tools. */
export async function completeCaseAnswer(
  req: Request,
  v: Viewer,
  caseId: string,
  task: string,
  prompt: (c: CaseRow) => string,
  handle: (text: string, c: CaseRow) => Promise<Response> | Response,
): Promise<Response> {
  const c = await gateCase(v, caseId, task);
  if (c instanceof Response) return c;
  let text: string;
  try {
    text = await completeAnswer(prompt(c), req.signal);
  } catch (e) {
    const { status, message } = aiErrorMessage(e);
    if (status >= 500) console.error(`AI ${task} failed`, e);
    return aiJson(status, message);
  }
  return handle(text, c);
}
