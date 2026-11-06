import "server-only";
import { cache } from "react";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CASE_COLUMNS, type CaseRow } from "@/lib/types";

export type CaseLoad = { cases: CaseRow[]; error: string | null };

/** All cases the current user may see (RLS filters). Deduplicated per request. */
export const loadCases = cache(async (): Promise<CaseLoad> => {
  if (!supabaseConfigured()) {
    return {
      cases: [],
      error:
        "Supabase isn't configured yet. Copy .env.example to .env.local and add your project URL and publishable key.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("cases").select(CASE_COLUMNS).order("code");
  if (error) return { cases: [], error: `Couldn't load the case bank: ${error.message}` };
  return { cases: data as CaseRow[], error: null };
});
