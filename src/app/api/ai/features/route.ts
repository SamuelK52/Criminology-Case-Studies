import { featuresPrompt } from "@/lib/ai/prompts";
import { aiJson, aiViewer, readBody, streamPlainAnswer } from "@/lib/ai/respond";
import { PII_MESSAGE, hasPII } from "@/lib/pii";

// FR-14: "Suggest features" on the Features tab — AI feature ideas for a chosen audience, streamed.
export async function POST(req: Request) {
  const v = await aiViewer();
  if (v instanceof Response) return v;
  const body = await readBody(req);
  const forWhom = typeof body?.forWhom === "string" ? body.forWhom.trim() : "";
  if (forWhom.length > 200) return aiJson(400, "Keep it to 200 characters.");
  if (hasPII(forWhom)) return aiJson(400, PII_MESSAGE);
  return streamPlainAnswer(req, v, "features", featuresPrompt(forWhom));
}
