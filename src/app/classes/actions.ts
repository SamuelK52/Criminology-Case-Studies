"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { can } from "@/lib/permissions";
import { checkClassCode, parseNewClass } from "@/lib/validate";

export type FormState = { error: string | null; ok?: string | null };

// Every action re-reads the session; RLS and the SQL functions re-check the role.

export async function createClass(_prev: FormState, form: FormData): Promise<FormState> {
  const v = await requireViewer();
  if (!can(v.role, "manageClasses")) return { error: "Only lecturers and the builder can create classes." };
  const parsed = parseNewClass(form);
  if (!parsed.ok) return { error: parsed.error };
  try {
    await withUser(v.id, (tx) => tx`
      insert into classes (name, join_code, lecturer_id) values (${parsed.value.name}, ${parsed.value.joinCode}, ${v.id})`);
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't create the class — try again.") };
  }
  revalidatePath("/classes");
  return { error: null, ok: `Class created. Students join with ${parsed.value.joinCode}.` };
}

export async function deleteClass(form: FormData): Promise<void> {
  const v = await requireViewer();
  const id = String(form.get("id") ?? "");
  // RLS: only the class's lecturer or the builder can delete; members' class is cleared (on delete set null).
  try {
    await withUser(v.id, (tx) => tx`delete from classes where id = ${id}`);
  } catch (e) {
    console.error("deleteClass failed", e);
  }
  revalidatePath("/classes");
}

export async function joinClass(_prev: FormState, form: FormData): Promise<FormState> {
  const v = await requireViewer();
  const code = String(form.get("code") ?? "").trim();
  const e = code ? checkClassCode(code) : "Enter the class code your lecturer gave you.";
  if (e) return { error: e };
  try {
    await withUser(v.id, (tx) => tx`select join_class(${code})`);
  } catch (err) {
    return { error: friendlyDbError(err, "Couldn't join that class — try again.") };
  }
  revalidatePath("/", "layout");
  return { error: null, ok: "You've joined the class." };
}

export async function leaveClass(): Promise<void> {
  const v = await requireViewer();
  await withUser(v.id, (tx) => tx`select leave_class()`);
  revalidatePath("/", "layout");
}
