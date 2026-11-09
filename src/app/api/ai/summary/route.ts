import { aiConfigured, aiErrorMessage, streamAnswer } from "@/lib/ai/claude";
import { SUMMARY_MODES, summaryPrompt, type SummaryMode } from "@/lib/ai/prompts";
import { getViewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PII_MESSAGE, hasPII } from "@/lib/pii";
import type { CaseRow } from "@/lib/types";

// FR-03: summarise notes into the chosen structure, streamed as plain text.
// The browser sends only { caseId, notes, mode }; the prompt is built here from the case record.

const json = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const v = await getViewer();
  if (!v) return json(401, "Sign in to use the AI tools.");
  if (!can(v.role, "ai")) return json(403, "AI tools are for students, lecturers and the builder.");
  if (!aiConfigured()) return json(503, "AI is offline — the built-in case file still works.");

  let body: { caseId?: unknown; notes?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, "Bad request.");
  }
  const caseId = typeof body.caseId === "string" ? body.caseId : "";
  const notes = typeof body.notes === "string" ? body.notes : "";
  const mode = SUMMARY_MODES.find((m) => m === body.mode) as SummaryMode | undefined;
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !mode) return json(400, "Bad request.");
  if (notes.length > 50000) return json(400, "Notes are limited to 50,000 characters.");
  if (hasPII(notes)) return json(400, PII_MESSAGE);

  // Read the case as this user (RLS) and take one AI token (20 per rolling hour) in one transaction.
  const gate = await withUser(v.id, async (tx) => {
    const [c] = await tx<CaseRow[]>`
      select id, code, name, jurisdiction, focus, overview, original_verdict, latest_outcome,
             needs_verify, owner_id, class_id, updated_at
      from cases where id = ${caseId}`;
    if (!c) return { c: null, allowed: false, retryAt: null };
    const [t] = await tx<{ allowed: boolean; retry_at: Date | null }[]>`select * from ai_take_token('summary')`;
    return { c, allowed: t.allowed, retryAt: t.retry_at };
  });
  if (!gate.c) return json(404, "Case not found.");
  if (!gate.allowed) {
    return json(429, "You've used your 20 AI requests for this hour.", { retryAt: gate.retryAt?.toISOString() ?? null });
  }

  const answer = streamAnswer(summaryPrompt(gate.c, notes, mode), req.signal);
  // Wait for the first chunk so a rejected request becomes a clear error, not an empty stream.
  let first: IteratorResult<string>;
  try {
    first = await answer.next();
  } catch (e) {
    const { status, message } = aiErrorMessage(e);
    if (status >= 500) console.error("AI summary failed", e);
    return json(status, message);
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
          console.error("AI summary stream failed", e);
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
