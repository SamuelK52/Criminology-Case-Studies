import type { CaseRow } from "@/lib/types";

// Prompt builders, copied from the prototype's ask() calls. Prompts are built on the server
// from the case record (read with RLS) and the student's notes — the browser never sends a prompt.

type CaseFacts = Pick<CaseRow, "name" | "jurisdiction" | "focus" | "overview" | "original_verdict" | "latest_outcome">;

/** The prototype's caseText(), with the original verdict added when it is recorded (accuracy NFR). */
export function caseText(c: CaseFacts): string {
  const focus = c.focus.join(", ");
  return (
    `Case: ${c.name}${c.jurisdiction ? ` (${c.jurisdiction})` : ""}. ` +
    (focus ? `Focus: ${focus}. ` : "") +
    (c.overview ? `Overview: ${c.overview} ` : "") +
    (c.original_verdict ? `Original verdict: ${c.original_verdict} ` : "") +
    (c.latest_outcome ? `Recorded outcome: ${c.latest_outcome}` : "")
  ).trim();
}

/** Summary modes, as in the prototype's select. */
export const SUMMARY_MODES = [
  "7-part assignment structure",
  "Short revision summary",
  "Key evidence & procedural issues",
] as const;
export type SummaryMode = (typeof SUMMARY_MODES)[number];

/** Resources tab, "Suggest what to look up" — the prototype's wording. */
export function sourcesPrompt(c: CaseFacts): string {
  return `${caseText(c)}\nList the types of primary and secondary sources a student should look up for this case (courts, inquiry reports, archives), what each would establish, and search terms to use. Do not invent specific citations or case numbers.`;
}

/** Flashcards tab, "Generate more with AI" — the prototype's wording (RULES goes in the system prompt). */
export function flashcardsPrompt(c: CaseFacts): string {
  return `${caseText(c)}\nMake 8 flashcards mixing recall and application (evidence-type, procedural issue, theory). Return JSON array of [front, back].`;
}

/** Quiz tab, "Generate a fresh 5-question quiz" — the prototype's wording. */
export function quizPrompt(c: CaseFacts): string {
  return `${caseText(c)}\nWrite 5 multiple-choice questions mixing recall and application. Return JSON array of {q, o:[4 options], a: exact correct option text, e: explanation}.`;
}

// ---------------------------------------------------------------- Arguments tab (FR-08)

/** The prototype's selects. */
export const LADDER_SIDES = ["Criminal (prosecution)", "Civil (plaintiff)"] as const;
export const LADDER_ROUNDS = ["3 arguments", "4 arguments", "5 arguments"] as const;
export type LadderSide = (typeof LADDER_SIDES)[number];
export type LadderRounds = (typeof LADDER_ROUNDS)[number];

/** "Build ladder" — the prototype's wording, including the "likely argument" label rule. */
export function ladderPrompt(c: CaseFacts, side: LadderSide, rounds: LadderRounds): string {
  const civ = side.startsWith("Civil");
  const p = civ ? "Plaintiff" : "Prosecution";
  return `${caseText(c)}\nBuild an argument ladder with ${rounds}. Use "${p}"${civ ? " (civil, balance of probabilities)" : " (criminal, beyond reasonable doubt)"}. For each round: ${p} claim + evidence type relied on → Defence counter-argument → Rebuttal → Defence reply. Label anything not from the trial record "likely argument". Keep both sides equal in effort. If the case ended in exoneration or quashing, present the prosecution's historical case and show why it collapsed. Then: What the court actually found; Strongest and weakest point for each side; Standard of proof reminder; one Evaluation question. End with "Verify before submitting:".`;
}

/** "Mock-trial speaking notes" — the prototype's wording. */
export function mootPrompt(c: CaseFacts): string {
  return `${caseText(c)}\nTurn this into mock-trial speaking notes for both sides: a 60-second opening, 4 cross-examination questions, a 60-second closing. Label likely arguments.`;
}

/** "Counter-check one point" — the prototype's wording. */
export function counterPrompt(c: CaseFacts, point: string): string {
  return `${caseText(c)}\nA student argues: "${point}". Give the strongest counter-argument from the opposing side, then a direct rebuttal to that counter, then which standard of proof matters and why. Label likely arguments.`;
}

/** Features tab, "Suggest features" — the prototype's wording, with its default audience. */
export function featuresPrompt(forWhom: string): string {
  return `The app is a criminology study tool with: case bank, AI summaries, resource organiser, flashcards, quizzes, prosecution vs defence argument ladders. Suggest 6 simple, buildable features for: ${forWhom || "a student revising for exams"}. For each: name, what it does, difficulty (Easy/Medium/Advanced).`;
}

/** The prototype's FEATS roadmap, word for word: [difficulty, name, what it does]. */
export const FEATURES: [string, string, string][] = [
  ["Easy", "Spaced-repetition flashcards", "Cards you miss come back sooner; cards you know fade out."],
  ["Easy", "Case comparison table", "Pick 2–4 cases and see jurisdiction, evidence type, core failure and outcome side by side."],
  ["Easy", "Theory matcher", "Type a theme like 'false confessions' and get 2–4 fitting cases with where each fits and doesn't."],
  ["Easy", "Verify-before-submitting list", "Auto-list of dates and outcomes to confirm against court records for each assignment."],
  ["Medium", "Assignment worksheet export", "Export the 7-part structure with a 'Your conclusion' line as a Word doc."],
  ["Medium", "Timeline builder", "Arrest → trial → appeals → later rulings on one line per case."],
  ["Medium", "Mock-trial timer", "60-second opening, cross-exam questions and closing with a countdown."],
  ["Medium", "Progress dashboard", "Quiz scores per case and per theme so you see weak topics."],
  ["Advanced", "Group study room", "Classmates join the same case and split prosecution / defence live."],
  ["Advanced", "PDF reader", "Upload a judgment PDF and get summary, key holdings and quiz questions from it."],
];

/** Shown instead of AI suggestions when AI is offline or not available for the role (prototype text). */
export const OFFLINE_SOURCES =
  "Court websites and judgments; official inquiry reports; reputable news for timelines, cross-checked against court documents.";

export function summaryPrompt(c: CaseFacts, notes: string, mode: SummaryMode): string {
  return `${caseText(c)}\n\nStudent notes:\n${notes || "(none)"}\n\nWrite a ${mode}. For the 7-part structure use: 1 Case background, 2 Investigation, 3 Criminological analysis (named theory only where it fits), 4 Court proceedings, 5 Final verdict, 6 Evaluation, 7 References to look up. End with "Verify before submitting:" and specific facts to confirm.`;
}
