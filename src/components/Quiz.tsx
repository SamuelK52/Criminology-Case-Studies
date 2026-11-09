"use client";

import { useState, useTransition } from "react";
import { saveQuizScore } from "@/app/cases/[code]/study-actions";
import type { QuizScore } from "@/lib/cases";
import type { QuizQuestion } from "@/lib/study";

type Props = {
  caseId: string;
  initialQuiz: QuizQuestion[];
  signedIn: boolean;
  aiState: "on" | "offline" | "none";
  scores: QuizScore[];
};

/** FR-07: the prototype's quiz. Pick an answer to see the right one and the explanation; the score saves when you finish. */
export function Quiz({ caseId, initialQuiz, signedIn, aiState, scores }: Props) {
  const [quiz, setQuiz] = useState(initialQuiz);
  const [round, setRound] = useState(0); // remounts the questions for a fresh quiz
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const done = Object.keys(picked).length;
  const score = quiz.reduce((n, q, i) => n + (picked[i] === q.a ? 1 : 0), 0);

  function answer(i: number, option: string) {
    if (picked[i] !== undefined) return;
    const next = { ...picked, [i]: option };
    setPicked(next);
    if (Object.keys(next).length === quiz.length) {
      const final = quiz.reduce((n, q, j) => n + (next[j] === q.a ? 1 : 0), 0);
      if (!signedIn) {
        setSaved(" · sign in to save your score");
        return;
      }
      setSaved(" · saving…");
      void saveQuizScore(caseId, final, quiz.length).then((r) => setSaved(r.error ? ` · ${r.error}` : " · saved to Progress"));
    }
  }

  function fresh() {
    setNote(null);
    startBusy(async () => {
      try {
        const res = await fetch("/api/ai/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId }),
        });
        const j = (await res.json().catch(() => ({}))) as { quiz?: QuizQuestion[]; error?: string; retryAt?: string | null };
        if (!res.ok || !j.quiz) {
          const when = j.retryAt ? ` Try again at ${new Date(j.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
          setNote(`${j.error ?? "Couldn't generate — try again."}${when}`);
          return;
        }
        setQuiz(j.quiz);
        setPicked({});
        setSaved(null);
        setRound((r) => r + 1);
        setNote("AI-written quiz — check answers against the case file before relying on them.");
      } catch {
        setNote("Couldn't reach the server — check your connection and try again.");
      }
    });
  }

  return (
    <>
      <div className="card" key={round} aria-busy={busy || undefined}>
        {quiz.length === 0 && (
          <p className="sub">
            No built-in quiz for this case yet — it needs an outcome, themes or a jurisdiction on record.
            {aiState === "on" && " Generate one with AI below."}
          </p>
        )}
        {quiz.map((q, i) => {
          const mine = picked[i];
          return (
            <fieldset key={i} style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
              <legend style={{ fontWeight: 700 }}>
                {i + 1}. {q.q}
              </legend>
              {q.o.map((o) => {
                const cls = mine === undefined ? "" : o === q.a ? " ok" : o === mine ? " no" : "";
                return (
                  <button
                    key={o}
                    type="button"
                    className={`opt${cls}`}
                    onClick={() => answer(i, o)}
                    aria-pressed={mine === o}
                    aria-disabled={mine !== undefined || undefined}
                  >
                    {o}
                  </button>
                );
              })}
              <div className="sub" aria-live="polite">
                {mine !== undefined && (
                  <>
                    <b>{mine === q.a ? "Correct." : `Answer: ${q.a}.`}</b> {q.e}
                  </>
                )}
              </div>
            </fieldset>
          );
        })}
        {done > 0 && (
          <div className="lbl" role="status">
            Score {score} / {done}
            {done === quiz.length && saved}
          </div>
        )}
      </div>
      <div className="row">
        {aiState === "on" && (
          <button className="btn" type="button" onClick={fresh} disabled={busy}>
            {busy ? "Generating…" : "Generate a fresh 5-question quiz"}
          </button>
        )}
        {aiState === "offline" && <span className="sub">AI is offline — this quiz is built from the case record.</span>}
        {note && (
          <span className="sub" role="status">
            {note}
          </span>
        )}
      </div>
      {signedIn && scores.length > 0 && (
        <div className="card">
          <div className="lbl">Your recent scores on this case</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {scores.map((s) => (
              <li key={s.takenAt} suppressHydrationWarning>
                {s.score} / {s.total} · {new Date(s.takenAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
