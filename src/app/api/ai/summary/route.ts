import { SUMMARY_MODES, summaryPrompt, type SummaryMode } from "@/lib/ai/prompts";
import { aiJson, aiViewer, isCaseId, readBody, streamCaseAnswer } from "@/lib/ai/respond";
import { PII_MESSAGE, hasPII } from "@/lib/pii";

// FR-03: summarise notes into the chosen structure, streamed as plain text.
// The browser sends only { caseId, notes, mode }; the prompt is built here from the case record.
export async function POST(req: Request) {
  const v = await aiViewer();
  if (v instanceof Response) return v;
  const body = await readBody(req);
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const mode = SUMMARY_MODES.find((m) => m === body?.mode) as SummaryMode | undefined;
  if (!isCaseId(body?.caseId) || !mode) return aiJson(400, "Bad request.");
  if (notes.length > 50000) return aiJson(400, "Notes are limited to 50,000 characters.");
  if (hasPII(notes)) return aiJson(400, PII_MESSAGE);
  return streamCaseAnswer(req, v, body.caseId, "summary", (c) => summaryPrompt(c, notes, mode));
}
