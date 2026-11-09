import { LADDER_ROUNDS, LADDER_SIDES, counterPrompt, ladderPrompt, mootPrompt, type LadderRounds, type LadderSide } from "@/lib/ai/prompts";
import { aiJson, aiViewer, isCaseId, readBody, streamCaseAnswer } from "@/lib/ai/respond";
import { PII_MESSAGE, hasPII } from "@/lib/pii";

// FR-08: argument ladder, mock-trial speaking notes and the one-point counter-check, streamed.
// The browser sends only the case id and the choices; the prompts are built here.
export async function POST(req: Request) {
  const v = await aiViewer();
  if (v instanceof Response) return v;
  const body = await readBody(req);
  if (!isCaseId(body?.caseId)) return aiJson(400, "Bad request.");
  const caseId = body.caseId;

  switch (body.kind) {
    case "ladder": {
      const side = LADDER_SIDES.find((s) => s === body.side) as LadderSide | undefined;
      const rounds = LADDER_ROUNDS.find((r) => r === body.rounds) as LadderRounds | undefined;
      if (!side || !rounds) return aiJson(400, "Bad request.");
      return streamCaseAnswer(req, v, caseId, "ladder", (c) => ladderPrompt(c, side, rounds));
    }
    case "moot":
      return streamCaseAnswer(req, v, caseId, "moot", mootPrompt);
    case "counter": {
      const point = typeof body.point === "string" ? body.point.trim() : "";
      if (!point) return aiJson(400, "Paste one point first, e.g. 'The confession proves guilt'.");
      if (point.length > 500) return aiJson(400, "Keep the point to 500 characters.");
      if (hasPII(point)) return aiJson(400, PII_MESSAGE);
      return streamCaseAnswer(req, v, caseId, "counter", (c) => counterPrompt(c, point));
    }
    default:
      return aiJson(400, "Bad request.");
  }
}
