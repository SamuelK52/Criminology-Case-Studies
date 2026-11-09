import type { CaseRow } from "@/lib/types";

/** FR-02: search the case bank by name, theme or jurisdiction (case-insensitive substring, all words). */
export function matchesCase(c: Pick<CaseRow, "name" | "focus" | "jurisdiction" | "code">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${c.code} ${c.name} ${c.focus.join(" ")} ${c.jurisdiction ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
