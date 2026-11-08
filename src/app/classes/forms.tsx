"use client";

import { useActionState } from "react";
import { createClass, joinClass, type FormState } from "./actions";

const initial: FormState = { error: null };

export function CreateClassForm() {
  const [state, action, pending] = useActionState(createClass, initial);
  return (
    <form action={action} noValidate>
      <label className="lbl" htmlFor="cname" style={{ display: "block" }}>Class name</label>
      <input id="cname" name="name" className="field" placeholder="e.g. Criminology 101 — Semester 1" required />
      <label className="lbl" htmlFor="ccode" style={{ display: "block", marginTop: 12 }}>Join code</label>
      <input id="ccode" name="joinCode" className="field" placeholder="e.g. CRIM101-2026" required style={{ textTransform: "uppercase" }} />
      <div className="err" role="alert">{state.error ?? ""}</div>
      <div className="ok-msg" role="status">{state.ok ?? ""}</div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create class"}</button>
      </div>
    </form>
  );
}

/** Submit button that asks before an action that can't be undone. */
export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <button className="btn ghost" type="submit" onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

export function JoinClassForm() {
  const [state, action, pending] = useActionState(joinClass, initial);
  return (
    <form action={action} noValidate>
      <label className="lbl" htmlFor="jcode" style={{ display: "block" }}>Class code</label>
      <div className="row">
        <input id="jcode" name="code" className="field" placeholder="e.g. CRIM101-2026" style={{ flex: 1, minWidth: 180, width: "auto" }} />
        <button className="btn" type="submit" disabled={pending}>{pending ? "Joining…" : "Join"}</button>
      </div>
      <div className="err" role="alert">{state.error ?? ""}</div>
      <div className="ok-msg" role="status">{state.ok ?? ""}</div>
    </form>
  );
}
