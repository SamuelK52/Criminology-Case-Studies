"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { can } from "@/lib/permissions";
import { checkResource } from "@/lib/resources";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResourceFormValues = { title: string; kind: string; url: string; share: string };
/** `saved` counts successful saves; the form uses it to clear itself and leave edit mode. */
export type ResourceState = { error: string | null; saved: number; values?: ResourceFormValues };

/**
 * FR-04: add a resource, or save changes to one (when `id` is sent).
 * `share` is "" (just me), a class id (lecturer/builder) or "all" (builder only).
 * Row-level security decides what is actually allowed; these checks give clear messages first.
 */
export async function saveResource(prev: ResourceState, form: FormData): Promise<ResourceState> {
  const values: ResourceFormValues = {
    title: String(form.get("title") ?? "").trim(),
    kind: String(form.get("kind") ?? ""),
    url: String(form.get("url") ?? "").trim(),
    share: String(form.get("share") ?? ""),
  };
  const fail = (error: string): ResourceState => ({ error, saved: prev.saved, values });

  const v = await getViewer();
  if (!v) return fail("Sign in to keep resources.");
  if (!can(v.role, "edit")) return fail("Your role can view resources only.");

  const caseId = String(form.get("caseId") ?? "");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(caseId) || (id && !UUID.test(id))) return fail("Bad request — reload the page and try again.");
  const problem = checkResource(values);
  if (problem) return fail(problem);

  let shared = false;
  let classId: string | null = null;
  if (values.share === "all") {
    if (v.role !== "builder") return fail("Only the builder can share with everyone.");
    shared = true;
  } else if (values.share) {
    if (v.role !== "lecturer" && v.role !== "builder") return fail("Only lecturers can share resources with a class.");
    if (!UUID.test(values.share)) return fail("Pick a class to share with.");
    shared = true;
    classId = values.share;
  }

  try {
    const changed = await withUser(v.id, (tx) =>
      id
        ? tx`update resources set title = ${values.title}, kind = ${values.kind}, url = ${values.url},
                    shared = ${shared}, class_id = ${classId}
             where id = ${id} and case_id = ${caseId} returning id`
        : tx`insert into resources (case_id, user_id, title, kind, url, shared, class_id)
             values (${caseId}, ${v.id}, ${values.title}, ${values.kind}, ${values.url}, ${shared}, ${classId})
             returning id`,
    );
    // RLS hides rows you can't change, so an update that matched nothing was not allowed (or is gone).
    if (changed.length === 0) return fail("That resource was removed, or you can't change it.");
  } catch (e) {
    return fail(friendlyDbError(e, "Couldn't save the resource — try again."));
  }
  revalidatePath("/cases", "layout");
  return { error: null, saved: prev.saved + 1 };
}

/** Remove a resource. RLS: your own (lecturers never remove students' work), or anything for the builder. */
export async function removeResource(id: string): Promise<{ error: string | null }> {
  const v = await getViewer();
  if (!v) return { error: "Sign in to change resources." };
  // Gate on "edit", not "del": a lecturer's "del" is off because they can't delete students' work,
  // but they may remove their own resources. RLS enforces exactly that (DECISIONS #30).
  if (!can(v.role, "edit")) return { error: "Your role can view resources only." };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Bad request — reload the page and try again." };
  try {
    const gone = await withUser(v.id, (tx) => tx`delete from resources where id = ${id} returning id`);
    if (gone.length === 0) return { error: "That resource was already removed, or you can't remove it." };
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't remove the resource — try again.") };
  }
  revalidatePath("/cases", "layout");
  return { error: null };
}
