import { flashcardsPrompt } from "@/lib/ai/prompts";
import { aiJson, aiViewer, completeCaseAnswer, isCaseId, readBody } from "@/lib/ai/respond";
import { withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { can } from "@/lib/permissions";
import { parseAiCards } from "@/lib/study";

// FR-06: "Generate more with AI". The new cards replace this user's earlier AI cards for the case
// (as in the prototype); the built-in cards and their progress are untouched.
export async function POST(req: Request) {
  const v = await aiViewer();
  if (v instanceof Response) return v;
  if (!can(v.role, "edit")) return aiJson(403, "Your role can't add flashcards.");
  const body = await readBody(req);
  if (!isCaseId(body?.caseId)) return aiJson(400, "Bad request.");
  const caseId = body.caseId;

  return completeCaseAnswer(req, v, caseId, "flashcards", flashcardsPrompt, async (text) => {
    const cards = parseAiCards(text);
    if (cards.length === 0) return aiJson(502, "The AI's cards weren't usable — try again. The built-in cards still work.");
    try {
      await withUser(v.id, async (tx) => {
        await tx`delete from flashcards where case_id = ${caseId} and user_id = ${v.id} and source = 'ai'`;
        for (const [front, back] of cards) {
          await tx`insert into flashcards (case_id, user_id, front, back, source) values (${caseId}, ${v.id}, ${front}, ${back}, 'ai')`;
        }
      });
    } catch (e) {
      return aiJson(500, friendlyDbError(e, "Couldn't save the new cards — try again."));
    }
    return Response.json({ added: cards.length }, { headers: { "Cache-Control": "no-store" } });
  });
}
