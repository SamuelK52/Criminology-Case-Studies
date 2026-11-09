import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { SETUP_MESSAGE, dbConfigured, withUser } from "@/lib/db";
import type { CaseRow } from "@/lib/types";

export type CaseLoad = { cases: CaseRow[]; error: string | null };

/** All cases the current user may see (RLS filters): shared bank, then class cases, then their own. */
export const loadCases = cache(async (userId: string | null = null): Promise<CaseLoad> => {
  await connection(); // request-time only: never query the database during `next build`
  if (!dbConfigured()) return { cases: [], error: SETUP_MESSAGE };
  try {
    const cases = await withUser(userId, (tx) => tx<CaseRow[]>`
      select id, code, name, jurisdiction, focus, overview, original_verdict, latest_outcome,
             needs_verify, owner_id, class_id, updated_at
      from cases
      order by (owner_id is not null), (class_id is not null), length(code), code`);
    return { cases: [...cases], error: null };
  } catch (e) {
    console.error("loadCases failed", e);
    return { cases: [], error: "Couldn't load the case bank — the database didn't respond. Try again in a moment." };
  }
});

/** One case by its code, if this user may see it (RLS). Reuses the per-request case list. */
export async function loadCase(code: string, userId: string | null) {
  const all = await loadCases(userId);
  return { c: all.cases.find((x) => x.code.toUpperCase() === code.toUpperCase()) ?? null, all };
}

/** The user's own notes for a case (private to them by RLS). */
export async function loadNote(caseId: string, userId: string): Promise<string> {
  const [row] = await withUser(userId, (tx) => tx<{ body: string }[]>`
    select body from notes where case_id = ${caseId} and user_id = ${userId}`);
  return row?.body ?? "";
}
