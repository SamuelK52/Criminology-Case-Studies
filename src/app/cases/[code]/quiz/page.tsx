import { Suspense } from "react";
import { Quiz } from "@/components/Quiz";
import type { Viewer } from "@/lib/auth";
import { loadCases, loadQuizScores } from "@/lib/cases";
import { seedQuiz } from "@/lib/study";
import type { CaseRow } from "@/lib/types";
import { CaseFrame, aiStateFor } from "../frame";

/** Quiz tab (FR-07): a built-in quiz from the case record, or a fresh AI one; finished scores are saved. */
export default function QuizPage({ params }: PageProps<"/cases/[code]/quiz">) {
  return (
    <CaseFrame params={params} tab="Quiz">
      {(c, v) => (
        <Suspense fallback={<div className="card" style={{ minHeight: 240 }} aria-busy="true" />}>
          <QuizView c={c} v={v} />
        </Suspense>
      )}
    </CaseFrame>
  );
}

async function QuizView({ c, v }: { c: CaseRow; v: Viewer | null }) {
  const [{ cases }, scores] = await Promise.all([loadCases(v?.id ?? null), v ? loadQuizScores(c.id, v.id) : Promise.resolve([])]);
  // Wrong options come from the shared case bank, as in the prototype.
  const others = cases.filter((x) => x.id !== c.id && !x.owner_id && !x.class_id);
  return <Quiz key={c.id} caseId={c.id} initialQuiz={seedQuiz(c, others)} signedIn={!!v} aiState={aiStateFor(v)} scores={scores} />;
}
