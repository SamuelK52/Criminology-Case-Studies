import "server-only";

// Google Gemini, called over its REST API (no SDK). Used instead of Claude when GEMINI_API_KEY is set.
// The key stays on the server; it is sent in the x-goog-api-key header, never in the URL.

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;
/** Google's recommended stable model for new projects (Nov 2026); override with GEMINI_MODEL. */
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const base = () => (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");

/** An HTTP error from the Gemini API (status = HTTP status, reason = Google's status string). */
export class GeminiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

type Chunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const BLOCKED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "OTHER", "LANGUAGE"]);
export const REFUSAL_NOTE = "\n\nThe AI declined to continue this request. Try rephrasing your notes, or use the built-in case file.";
export const CUTOFF_NOTE = "\n\n(The answer was cut off at the length limit.)";

/** Text, finish reason and block reason from one streamed chunk. */
export function readChunk(c: Chunk): { text: string; finish?: string; blocked?: string } {
  const cand = c.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  return { text, finish: cand?.finishReason, blocked: c.promptFeedback?.blockReason };
}

/** Stream a study answer as text chunks, with `system` as the system instruction (RULES). */
export async function* streamGemini(system: string, prompt: string, signal?: AbortSignal): AsyncGenerator<string> {
  const res = await fetch(`${base()}/v1beta/models/${encodeURIComponent(geminiModel())}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 16384 },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
    throw new GeminiError(res.status, j.error?.status ?? "", j.error?.message ?? `HTTP ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let finish: string | undefined;
  let blocked: string | undefined;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    buf += r.value;
    // Server-sent events: one JSON object per "data:" line, events separated by blank lines.
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      const c = readChunk(chunk);
      if (c.text) yield c.text;
      finish = c.finish ?? finish;
      blocked = c.blocked ?? blocked;
    }
  }
  if (blocked || (finish && BLOCKED.has(finish))) yield REFUSAL_NOTE;
  else if (finish === "MAX_TOKENS") yield CUTOFF_NOTE;
}
