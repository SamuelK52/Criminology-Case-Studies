import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { dbConfigured, withUser } from "@/lib/db";
import { hashToken } from "@/lib/password";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "caselab_session";
export const SESSION_DAYS = 30;

export type Viewer = {
  id: string;
  name: string;
  role: Role;
  requestedRole: Role | null;
  classId: string | null;
  className: string | null;
  classCode: string | null;
};

/**
 * Who is signed in? Reads the session cookie, resolves it in the database and loads the profile.
 * Deduplicated per request with React cache(), so a role change or sign-out shows on the next request.
 * Must be called behind <Suspense> (it reads cookies at request time).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !dbConfigured()) return null;
  try {
    const userId = await withUser(null, async (tx) => {
      const [r] = await tx<{ uid: string | null }[]>`select resolve_session(${hashToken(token)}) as uid`;
      return r?.uid ?? null;
    });
    if (!userId) return null;
    return await withUser(userId, async (tx) => {
      const [p] = await tx<
        { display_name: string; role: Role; requested_role: Role | null; class_id: string | null; class_name: string | null; join_code: string | null }[]
      >`
        select p.display_name, p.role::text as role, p.requested_role::text as requested_role,
               p.class_id, c.name as class_name, c.join_code
        from profiles p left join classes c on c.id = p.class_id
        where p.id = ${userId}`;
      if (!p) return null;
      return {
        id: userId,
        name: p.display_name,
        role: p.role,
        requestedRole: p.requested_role,
        classId: p.class_id,
        className: p.class_name,
        classCode: p.join_code,
      };
    });
  } catch (e) {
    console.error("getViewer failed", e);
    return null;
  }
});

/** For pages and actions that need a signed-in user. */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}
