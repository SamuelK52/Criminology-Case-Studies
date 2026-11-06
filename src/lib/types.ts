export type Role = "student" | "lecturer" | "peer" | "builder";

export type CaseRow = {
  id: string;
  code: string;
  name: string;
  jurisdiction: string | null;
  focus: string[];
  overview: string | null;
  original_verdict: string | null;
  latest_outcome: string | null;
  needs_verify: boolean;
  owner_id: string | null;
  class_id: string | null;
  updated_at: string;
};

export const CASE_COLUMNS =
  "id, code, name, jurisdiction, focus, overview, original_verdict, latest_outcome, needs_verify, owner_id, class_id, updated_at";

/** Index-card stripe colour per jurisdiction. User cases are lemon (dark text). */
const JURISDICTION_COLOUR: Record<string, string> = {
  Malaysia: "var(--signal)",
  UK: "var(--cobalt)",
  US: "var(--violet)",
  Italy: "var(--emerald)",
};
export const caseColour = (c: Pick<CaseRow, "jurisdiction">) =>
  (c.jurisdiction && JURISDICTION_COLOUR[c.jurisdiction]) || "var(--lemon)";
export const isLightColour = (colour: string) => colour.includes("lemon");
