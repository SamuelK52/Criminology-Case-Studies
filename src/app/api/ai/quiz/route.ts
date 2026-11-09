import { quizPrompt } from "@/lib/ai/prompts";
import { aiJson, aiViewer, completeCaseAnswer, isCaseId, readBody } from "@/lib/ai/respond";
import { parseAiQuiz } from "@/lib/study";

// FR-07: "Generate a fresh 5-question quiz". Returns the checked questions; nothing is stored
// until the student finishes and the score is saved.
export async function POST(req: Request) {
  const v = await aiViewer();
  if (v instanceof Response) return v;
  const body = await readBody(req);
  if (!isCaseId(body?.caseId)) return aiJson(400, "Bad request.");

  return completeCaseAnswer(req, v, body.caseId, "quiz", quizPrompt, (text) => {
    const quiz = parseAiQuiz(text);
    if (quiz.length === 0) return aiJson(502, "The AI's quiz wasn't usable — try again. The built-in quiz still works.");
    return Response.json({ quiz }, { headers: { "Cache-Control": "no-store" } });
  });
}
