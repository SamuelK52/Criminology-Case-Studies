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

/** Shown instead of AI suggestions when AI is offline or not available for the role (prototype text). */
export const OFFLINE_SOURCES =
  "Court websites and judgments; official inquiry reports; reputable news for timelines, cross-checked against court documents.";

export function summaryPrompt(c: CaseFacts, notes: string, mode: SummaryMode): string {
  return `${caseText(c)}\n\nStudent notes:\n${notes || "(none)"}\n\nWrite a ${mode}. For the 7-part structure use: 1 Case background, 2 Investigation, 3 Criminological analysis (named theory only where it fits), 4 Court proceedings, 5 Final verdict, 6 Evaluation, 7 References to look up. End with "Verify before submitting:" and specific facts to confirm.`;
}
