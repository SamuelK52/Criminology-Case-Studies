import { PII_MESSAGE, hasPII } from "@/lib/pii";
import { SIGNUP_ROLES, type SignupRole } from "@/lib/permissions";

// Form checks shared by the sign-in/sign-up actions. The database re-checks names, emails,
// class codes and PII, so these are for clear messages, not security.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CLASS_CODE = /^[A-Za-z0-9-]{4,32}$/;

export type SignUpInput = { email: string; password: string; name: string; role: SignupRole; classCode: string };
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function checkEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return "Enter your email.";
  if (email.length > 254 || !EMAIL.test(email)) return "Enter a valid email, like aisyah@example.com.";
  return null;
}

export function checkPassword(pw: string): string | null {
  if (pw.length < 8) return "Use a password of at least 8 characters.";
  if (pw.length > 200) return "That password is too long (200 characters at most).";
  return null;
}

export function checkClassCode(raw: string): string | null {
  const code = raw.trim();
  if (!code) return null; // optional
  if (hasPII(code)) return PII_MESSAGE;
  if (!CLASS_CODE.test(code)) return "Class codes use 4–32 letters, numbers or dashes, like CRIM101-2026.";
  return null;
}

export function parseSignUp(form: FormData): Checked<SignUpInput> {
  const email = str(form.get("email")).trim();
  const password = str(form.get("password"));
  const name = str(form.get("name")).trim();
  const roleRaw = str(form.get("role"));
  const classCode = str(form.get("classCode")).trim();

  if (!(SIGNUP_ROLES as readonly string[]).includes(roleRaw)) return { ok: false, error: "Choose a role." };
  if (name.length < 2) return { ok: false, error: "Enter a name of at least 2 characters." };
  if (name.length > 60) return { ok: false, error: "Keep your name to 60 characters." };
  if (hasPII(name) || hasPII(email)) return { ok: false, error: PII_MESSAGE };
  const e = checkEmail(email) ?? checkPassword(password) ?? checkClassCode(classCode);
  if (e) return { ok: false, error: e };
  return { ok: true, value: { email, password, name, role: roleRaw as SignupRole, classCode } };
}

export function parseSignIn(form: FormData): Checked<{ email: string; password: string }> {
  const email = str(form.get("email")).trim();
  const password = str(form.get("password"));
  const e = checkEmail(email) ?? (password ? null : "Enter your password.");
  if (e) return { ok: false, error: e };
  return { ok: true, value: { email, password } };
}

/** Class name + join code for a new class (lecturers). */
export function parseNewClass(form: FormData): Checked<{ name: string; joinCode: string }> {
  const name = str(form.get("name")).trim();
  const joinCode = str(form.get("joinCode")).trim().toUpperCase();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter a class name of 2–80 characters." };
  if (hasPII(name)) return { ok: false, error: PII_MESSAGE };
  if (!joinCode) return { ok: false, error: "Enter a join code, like CRIM101-2026." };
  const e = checkClassCode(joinCode);
  if (e) return { ok: false, error: e };
  return { ok: true, value: { name, joinCode } };
}
