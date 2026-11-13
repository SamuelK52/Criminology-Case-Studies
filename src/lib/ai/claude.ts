import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GeminiError, geminiConfigured, geminiModel, streamGemini } from "@/lib/ai/gemini";
import { RULES } from "@/lib/ai/rules";

// Server-only AI client. Gemini is used when GEMINI_API_KEY is set, otherwise Claude (ANTHROPIC_API_KEY).
// Keys never reach the browser. Every caller goes through streamAnswer / completeAnswer below.
export const aiProvider = (): "gemini" | "claude" | null =>
  geminiConfigured() ? "gemini" : process.env.ANTHROPIC_API_KEY ? "claude" : null;
export const aiConfigured = () => aiProvider() !== null;
export const aiModel = () => (aiProvider() === "gemini" ? geminiModel() : process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5");

// Server-side refusal fallback ("default" routing) is accepted by these models on the Claude API.
const FALLBACK_MODELS = /^claude-(sonnet-5-5|opus-5|opus-5-5|fable-5|fable-5-1)$/;

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic({ maxRetries: 2 }));

/**
 * Stream a study answer as plain text chunks. RULES is the system prompt, for either provider.
 * Throws (Anthropic.APIError or GeminiError) before the first chunk if the request is rejected.
 */
export async function* streamAnswer(prompt: string, signal?: AbortSignal): AsyncGenerator<string> {
  if (aiProvider() === "gemini") {
    yield* streamGemini(RULES, prompt, signal);
    return;
  }
  const model = aiModel();
  const withFallback = FALLBACK_MODELS.test(model);
  const stream = claude().beta.messages.stream(
    {
      model,
      max_tokens: 64000,
      system: RULES,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: prompt }],
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield "\n\nThe AI declined to continue this request. Try rephrasing your notes, or use the built-in case file.";
  } else if (final.stop_reason === "max_tokens") {
    yield "\n\n(The answer was cut off at the length limit.)";
  }
}

/** A short, safe message for an AI failure (never the raw provider error). */
export function aiErrorMessage(e: unknown): { status: number; message: string } {
  if (e instanceof GeminiError) {
    if (e.status === 429) return { status: 503, message: "The AI service is busy — try again in a minute." };
    if (e.status === 401 || e.status === 403 || /api key/i.test(e.message)) {
      return { status: 503, message: "AI is offline (the server's API key was rejected). The built-in case file still works." };
    }
    if (e.status === 400 || e.status === 404) return { status: 502, message: "The AI couldn't process this request." };
    return { status: 502, message: "The AI service had a problem — try again in a moment." };
  }
  if (e instanceof Anthropic.RateLimitError) return { status: 503, message: "The AI service is busy — try again in a minute." };
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, message: "AI is offline (the server's API key was rejected). The built-in case file still works." };
  }
  if (e instanceof Anthropic.BadRequestError) return { status: 502, message: "The AI couldn't process this request." };
  if (e instanceof Anthropic.APIError) return { status: 502, message: "The AI service had a problem — try again in a moment." };
  if ((e as Error)?.name === "AbortError") return { status: 499, message: "Stopped." };
  return { status: 500, message: "Couldn't generate — try again in a moment." };
}

/** The whole answer as one string (for JSON tools: flashcards, quiz). Same request as streamAnswer. */
export async function completeAnswer(prompt: string, signal?: AbortSignal): Promise<string> {
  let text = "";
  for await (const chunk of streamAnswer(prompt, signal)) text += chunk;
  return text;
}
