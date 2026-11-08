import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { requireViewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { ROLES, can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { RoleForm } from "./RoleForm";

export const metadata: Metadata = { title: "Admin · CaseLab Criminology" };

export default function AdminPage() {
  return (
    <div className="wrap">
      <AppHeader page="admin" title="Admin" />
      <div className="folder" style={{ "--folder": "var(--lemon)" } as React.CSSProperties} data-light>
        <div className="folder-cap">
          <span>Archive / Admin</span>
          <span>Users &amp; roles</span>
        </div>
        <Suspense fallback={<div className="pane" aria-busy="true"><p className="sub">Loading accounts…</p></div>}>
          <Users />
        </Suspense>
      </div>
    </div>
  );
}

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  requested_role: Role | null;
  class_name: string | null;
  join_code: string | null;
  created_at: Date;
};

async function Users() {
  const v = await requireViewer();
  if (!can(v.role, "manageUsers")) {
    return (
      <div className="pane">
        <div className="card" role="alert">
          <div className="lbl">Builder only</div>
          <p>Only the builder can change user roles.</p>
        </div>
      </div>
    );
  }
  // Enums are returned as text (the app treats roles as plain strings).
  const users = await withUser(v.id, (tx) => tx<UserRow[]>`
    select id, email, display_name, role::text as role, requested_role::text as requested_role,
           class_name, join_code, created_at
    from admin_list_users()`);
  const pending = users.filter((u) => u.requested_role === "lecturer" && u.role !== "lecturer").length;

  return (
    <div className="pane">
      <p className="sub">
        {users.length} account{users.length === 1 ? "" : "s"}
        {pending ? ` · ${pending} lecturer request${pending === 1 ? "" : "s"} waiting (listed first)` : ""}. Changes
        apply on the user&apos;s next page load.
      </p>
      <div className="card">
        <div className="lbl">Users</div>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Class</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.display_name}
                    {u.id === v.id && " (you)"}
                    {u.requested_role === "lecturer" && u.role !== "lecturer" && (
                      <div><span className="chip pending">wants lecturer</span></div>
                    )}
                  </td>
                  <td style={{ wordBreak: "break-all" }}>{u.email}</td>
                  <td>{u.class_name ? `${u.class_name} (${u.join_code})` : "—"}</td>
                  <td>
                    <div className="sub" style={{ margin: "0 0 4px" }}>{ROLES[u.role].name}</div>
                    <RoleForm userId={u.id} role={u.role} requested={u.requested_role} name={u.display_name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
