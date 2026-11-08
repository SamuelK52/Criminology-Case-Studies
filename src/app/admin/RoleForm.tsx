"use client";

import { useActionState } from "react";
import { ROLES } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { setRole, type RoleState } from "./actions";

const initial: RoleState = { error: null };

export function RoleForm({ userId, role, requested, name }: { userId: string; role: Role; requested: Role | null; name: string }) {
  const [state, action, pending] = useActionState(setRole, initial);
  return (
    <div>
      <form action={action} className="row">
        <input type="hidden" name="userId" value={userId} />
        <label className="sr-only" htmlFor={`role-${userId}`}>Role for {name}</label>
        <select id={`role-${userId}`} name="role" className="field" defaultValue={role} style={{ width: "auto" }}>
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLES[r].name}</option>
          ))}
        </select>
        <button className="btn ghost" type="submit" disabled={pending}>Save</button>
      </form>
      {requested === "lecturer" && role !== "lecturer" && (
        <form action={action} style={{ marginTop: 6 }}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="role" value="lecturer" />
          <button className="btn" type="submit" disabled={pending}>Approve lecturer</button>
        </form>
      )}
      <div className="err" role="alert">{state.error ?? ""}</div>
      <div className="ok-msg" role="status">{state.ok ?? ""}</div>
    </div>
  );
}
