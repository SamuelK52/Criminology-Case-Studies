"use client";

import { useActionState, useState } from "react";
import { ROLES, SIGNUP_ROLES, type SignupRole } from "@/lib/permissions";
import { isLightColour } from "@/lib/types";
import { signIn, signUp, type AuthState } from "./actions";

const initial: AuthState = { error: null };

export function LoginForm({ startMode = "signin" }: { startMode?: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(startMode);
  const [inState, inAction, inPending] = useActionState(signIn, initial);
  const [upState, upAction, upPending] = useActionState(signUp, initial);
  const state = mode === "signin" ? inState : upState;
  const pending = mode === "signin" ? inPending : upPending;
  const v = state.values ?? {};
  const [role, setRole] = useState<SignupRole>(
    (SIGNUP_ROLES as readonly string[]).includes(v.role ?? "") ? (v.role as SignupRole) : "student",
  );

  return (
    <form className="card" action={mode === "signin" ? inAction : upAction} noValidate>
      <div className="row" role="tablist" aria-label="Sign in or create an account" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={mode === "signin"} className={`btn${mode === "signin" ? "" : " ghost"}`} onClick={() => setMode("signin")}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === "signup"} className={`btn${mode === "signup" ? "" : " ghost"}`} onClick={() => setMode("signup")}>
          Create account
        </button>
      </div>

      {mode === "signup" && (
        <>
          <div className="lbl" id="role-lbl">1 · Choose your role</div>
          <div className="roles" role="radiogroup" aria-labelledby="role-lbl">
            {SIGNUP_ROLES.map((k) => {
              const r = ROLES[k];
              const desc = k === "lecturer" ? "Approved by the builder · curates cases" : r.desc;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={role === k}
                  aria-label={`${r.name}: ${desc}`}
                  className="role"
                  style={{ "--c": r.colour } as React.CSSProperties}
                  data-light={isLightColour(r.colour) || undefined}
                  onClick={() => setRole(k)}
                >
                  <b>{r.name}</b>
                  <span>{desc}</span>
                </button>
              );
            })}
            <div className="role" aria-hidden="true" style={{ "--c": ROLES.builder.colour, cursor: "default", opacity: 0.45 } as React.CSSProperties} data-light>
              <b>Builder</b>
              <span>Assigned by the app owner</span>
            </div>
          </div>
          <input type="hidden" name="role" value={role} />

          <label className="lbl" htmlFor="name" style={{ marginTop: 18, display: "block" }}>2 · Your name</label>
          <input id="name" name="name" className="field" autoComplete="nickname" placeholder="e.g. Aisyah" defaultValue={v.name} required />
        </>
      )}

      <label className="lbl" htmlFor="email" style={{ marginTop: 12, display: "block" }}>
        {mode === "signup" ? "3 · Email" : "Email"}
      </label>
      <input id="email" name="email" type="email" className="field" autoComplete="email" defaultValue={v.email} required />

      <label className="lbl" htmlFor="password" style={{ marginTop: 12, display: "block" }}>
        {mode === "signup" ? "4 · Password (8+ characters)" : "Password"}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        className="field"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        minLength={mode === "signup" ? 8 : undefined}
        required
      />

      {mode === "signup" && (
        <>
          <label className="lbl" htmlFor="classCode" style={{ marginTop: 12, display: "block" }}>
            5 · Class code <span style={{ textTransform: "none" }}>(optional)</span>
          </label>
          <input id="classCode" name="classCode" className="field" placeholder="e.g. CRIM101-2026" defaultValue={v.classCode} />
        </>
      )}

      <div className="err" role="alert">{state.error ?? ""}</div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Opening…" : mode === "signin" ? "Open archive" : "Create account"}
        </button>
      </div>
    </form>
  );
}
