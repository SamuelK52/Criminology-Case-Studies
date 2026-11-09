import { sourcesPrompt } from "@/lib/ai/prompts";
import { aiJson, aiViewer, isCaseId, readBody, streamCaseAnswer } from "@/lib/ai/respond";

// FR-04: "Suggest what to look up" — types of sources and search terms for this case, streamed.
// The browser sends only { caseId }; no specific citations are invented (prompt and RULES).
export async function POST(req: Request) {
  const v = await aiViewer();
  if (v instanceof Response) return v;
  const body = await readBody(req);
  if (!isCaseId(body?.caseId)) return aiJson(400, "Bad request.");
  return streamCaseAnswer(req, v, body.caseId, "sources", sourcesPrompt);
}
