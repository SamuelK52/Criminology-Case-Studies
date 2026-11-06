import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { SETUP_MESSAGE, dbConfigured, withUser } from "@/lib/db";
import type { CaseRow } from "@/lib/types";

export type CaseLoad = { cases: CaseRow[]; error: string | null };

/** All cases the current user may see (RLS filters). Deduplicated per request. */
export const loadCases = cache(async (userId: string | null = null): Promise<CaseLoad> => {
  await connection(); // request-time only: never query the database during `next build`
  if (!dbConfigured()) return { cases: [], error: SETUP_MESSAGE };
  try {
    const cases = await withUser(userId, (tx) => tx<CaseRow[]>`
      select id, code, name, jurisdiction, focus, overview, original_verdict, latest_outcome,
             needs_verify, owner_id, class_id, updated_at
      from cases
      order by (owner_id is not null), code`);
    return { cases: [...cases], error: null };
  } catch (e) {
    console.error("loadCases failed", e);
    return { cases: [], error: "Couldn't load the case bank — the database didn't respond. Try again in a moment." };
  }
});
