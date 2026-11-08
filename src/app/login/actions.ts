"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { SETUP_MESSAGE, dbConfigured, withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { burnPasswordCheck, hashPassword, hashToken, newSessionToken, verifyPassword } from "@/lib/password";
import { parseSignIn, parseSignUp } from "@/lib/validate";

export type AuthState = {
  error: string | null;
  // Echo the fields back so a failed submit doesn't clear the form (never the password).
  values?: { email?: string; name?: string; role?: string; classCode?: string };
};

const echo = (form: FormData): AuthState["values"] => ({
  email: String(form.get("email") ?? ""),
  name: String(form.get("name") ?? ""),
  role: String(form.get("role") ?? ""),
  classCode: String(form.get("classCode") ?? ""),
});

async function startSession(userId: string) {
  const token = newSessionToken();
  const expires = await withUser(null, async (tx) => {
    const [r] = await tx<{ exp: Date }[]>`select create_session(${userId}, ${hashToken(token)}, ${SESSION_DAYS}) as exp`;
    return r.exp;
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!dbConfigured()) return { error: SETUP_MESSAGE, values: echo(form) };
  const parsed = parseSignUp(form);
  if (!parsed.ok) return { error: parsed.error, values: echo(form) };
  const { email, password, name, role, classCode } = parsed.value;

  let userId: string;
  try {
    const hash = await hashPassword(password);
    userId = await withUser(null, async (tx) => {
      const [r] = await tx<{ id: string }[]>`
        select create_user(${email}, ${hash}, ${name}, ${role}, ${classCode || null}) as id`;
      return r.id;
    });
    await startSession(userId);
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't create your account — try again in a moment."), values: echo(form) };
  }
  redirect("/");
}

const WRONG = "That email and password don't match an account.";

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!dbConfigured()) return { error: SETUP_MESSAGE, values: echo(form) };
  const parsed = parseSignIn(form);
  if (!parsed.ok) return { error: parsed.error, values: echo(form) };
  const { email, password } = parsed.value;

  try {
    const login = await withUser(null, async (tx) => {
      const [{ allowed }] = await tx<{ allowed: boolean }[]>`select login_allowed(${email}) as allowed`;
      if (!allowed) return "throttled" as const;
      const [row] = await tx<{ id: string; password_hash: string }[]>`select * from get_login(${email})`;
      return row ?? null;
    });
    if (login === "throttled") {
      return { error: "Too many wrong attempts for this email. Wait 15 minutes and try again.", values: echo(form) };
    }
    const ok = login ? await verifyPassword(password, login.password_hash) : (await burnPasswordCheck(password), false);
    if (!login || !ok) {
      await withUser(null, (tx) => tx`select login_failed(${email})`);
      return { error: WRONG, values: echo(form) };
    }
    await withUser(null, (tx) => tx`select login_succeeded(${email})`);
    await startSession(login.id);
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't sign you in — try again in a moment."), values: echo(form) };
  }
  redirect("/");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && dbConfigured()) {
    try {
      await withUser(null, (tx) => tx`select delete_session(${hashToken(token)})`);
    } catch (e) {
      console.error("signOut: couldn't delete the session row", e);
    }
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
