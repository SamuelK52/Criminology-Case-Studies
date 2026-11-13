import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES } from "@/lib/ai/rules";

// Gemini provider: request shape, streaming (server-sent events), refusals and error messages.
// fetch is replaced, so nothing is sent to Google.

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");
const text = (t: string, finishReason?: string) => ({ candidates: [{ content: { parts: [{ text: t }] }, ...(finishReason ? { finishReason } : {}) }] });

function mockFetch(body: string, status = 200, splitAt?: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (status !== 200) return new Response(body, { status, headers: { "Content-Type": "application/json" } });
    const enc = new TextEncoder();
    const parts = splitAt ? [body.slice(0, splitAt), body.slice(splitAt)] : [body];
    return new Response(new ReadableStream({ start(c) { parts.forEach((p) => c.enqueue(enc.encode(p))); c.close(); } }), { status });
  });
  return calls;
}

async function collect(gen: AsyncGenerator<string>) {
  let out = "";
  for await (const t of gen) out += t;
  return out;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider choice", () => {
  it("uses Gemini when GEMINI_API_KEY is set, Claude otherwise, and is offline with neither", async () => {
    let m = await import("@/lib/ai/claude");
    expect([m.aiProvider(), m.aiModel(), m.aiConfigured()]).toEqual(["gemini", "gemini-3.5-flash-lite", true]);
    vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
    expect(m.aiModel()).toBe("gemini-3.8-flash");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "x");
    expect(m.aiProvider()).toBe("claude");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    m = await import("@/lib/ai/claude");
    expect(m.aiConfigured()).toBe(false);
  });
});

describe("streaming from Gemini", () => {
  it("sends RULES as the system instruction, the key in a header (not the URL), and streams the text", async () => {
    const calls = mockFetch(sse(text("1 Case "), text("background."), text("", "STOP")), 200, 25);
    const { streamAnswer } = await import("@/lib/ai/claude");
    expect(await collect(streamAnswer("Summarise case 07"))).toBe("1 Case background.");
    const { url, init } = calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe(RULES);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Summarise case 07" }] }]);
  });
  it("skips thought parts, and notes a refusal or a cut-off answer", async () => {
    mockFetch(sse({ candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: "Answer" }] } }] }, text("", "SAFETY")));
    const { streamAnswer } = await import("@/lib/ai/claude");
    expect(await collect(streamAnswer("x"))).toMatch(/^Answer\n\nThe AI declined/);
    mockFetch(sse(text("Long", "MAX_TOKENS")));
    expect(await collect(streamAnswer("x"))).toBe("Long\n\n(The answer was cut off at the length limit.)");
    mockFetch(sse({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }));
    expect(await collect(streamAnswer("x"))).toMatch(/declined/);
  });
});

describe("Gemini errors become short, safe messages", () => {
  const err = (status: number, message: string, st = "") => JSON.stringify({ error: { code: status, message, status: st } });
  it.each([
    [400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT", 503, /key was rejected/],
    [403, "Permission denied", "PERMISSION_DENIED", 503, /key was rejected/],
    [429, "Resource exhausted", "RESOURCE_EXHAUSTED", 503, /busy/],
    [404, "models/x is not found", "NOT_FOUND", 502, /couldn't process/],
    [500, "Internal", "INTERNAL", 502, /had a problem/],
  ])("HTTP %i", async (status, message, st, want, text) => {
    mockFetch(err(status, message, st), status);
    const { streamAnswer, aiErrorMessage } = await import("@/lib/ai/claude");
    const e = await collect(streamAnswer("x")).catch((x: unknown) => x);
    const r = aiErrorMessage(e);
    expect(r.status).toBe(want);
    expect(r.message).toMatch(text);
    expect(r.message).not.toContain(message); // never the raw provider text
  });
});
