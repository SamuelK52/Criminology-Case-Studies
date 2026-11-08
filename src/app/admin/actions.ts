"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { ROLES } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export type RoleState = { error: string | null; ok?: string | null };

/** Builder only — set_user_role() re-checks that in the database. */
export async function setRole(_prev: RoleState, form: FormData): Promise<RoleState> {
  const v = await requireViewer();
  const userId = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "") as Role;
  if (!(role in ROLES)) return { error: "Choose a role." };
  try {
    await withUser(v.id, (tx) => tx`select set_user_role(${userId}, ${role}::app_role)`);
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't change the role — try again.") };
  }
  revalidatePath("/", "layout");
  return { error: null, ok: `Saved: ${ROLES[role].name}.` };
}
