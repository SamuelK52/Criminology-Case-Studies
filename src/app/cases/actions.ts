"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { loadCases } from "@/lib/cases";
import { withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { can } from "@/lib/permissions";
import { PII_MESSAGE, hasPII } from "@/lib/pii";

export type AddCaseState = { error: string | null; name?: string };

/** FR-02 / FR-10: add your own case. The database re-checks role, duplicates and PII. */
export async function addCase(_prev: AddCaseState, form: FormData): Promise<AddCaseState> {
  const r = await addCaseInner(form);
  // Echo the typed name back so a rejected name can be corrected rather than retyped.
  return { ...r, name: String(form.get("name") ?? "") };
}

async function addCaseInner(form: FormData): Promise<AddCaseState> {
  const v = await getViewer();
  if (!v) return { error: "Sign in to add your own cases." };
  if (!can(v.role, "add")) return { error: "Your role can view cases only." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Type a case name first." };
  if (name.length < 3) return { error: "Case name needs at least 3 characters." };
  if (name.length > 120) return { error: "Keep the case name to 120 characters." };
  if (hasPII(name)) return { error: PII_MESSAGE };
  const { cases } = await loadCases(v.id);
  if (cases.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
    return { error: "That case is already in the list." };
  }

  let code: string;
  try {
    code = await withUser(v.id, async (tx) => {
      const [row] = await tx<{ code: string }[]>`
        insert into cases (name, owner_id, needs_verify) values (${name}, ${v.id}, true) returning code`;
      return row.code;
    });
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't add the case — try again.") };
  }
  revalidatePath("/cases", "layout");
  redirect(`/cases/${code}`);
}

export type SaveState = { status: "idle" | "saved" | "error"; message?: string; at?: number };

/** Notes autosave (one note per user per case). */
export async function saveNotes(caseId: string, body: string): Promise<SaveState> {
  const v = await getViewer();
  if (!v) return { status: "error", message: "Sign in to save notes." };
  if (!can(v.role, "edit")) return { status: "error", message: "Your role can't edit notes." };
  if (typeof body !== "string" || body.length > 50000) return { status: "error", message: "Notes are limited to 50,000 characters." };
  if (hasPII(body)) return { status: "error", message: `${PII_MESSAGE} (Notes not saved.)` };
  try {
    await withUser(v.id, (tx) => tx`
      insert into notes (case_id, user_id, body) values (${caseId}, ${v.id}, ${body})
      on conflict (case_id, user_id) do update set body = excluded.body, updated_at = now()`);
  } catch (e) {
    return { status: "error", message: friendlyDbError(e, "Couldn't save your notes — they're still on screen. Try again.") };
  }
  return { status: "saved", at: Date.now() };
}
