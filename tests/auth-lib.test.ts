import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "@/lib/password";
import { ROLES, SIGNUP_ROLES, can } from "@/lib/permissions";
import { parseNewClass, parseSignIn, parseSignUp } from "@/lib/validate";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong horse", a)).toBe(false);
  });
  it("rejects malformed or tampered hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1073741824$8$1$c2FsdA$aGFzaA")).toBe(false); // absurd N
    expect(await verifyPassword("x", "scrypt$32768$8$1$c2FsdA$short")).toBe(false);
  });
  it("session tokens are random and stored only as SHA-256", () => {
    const t1 = newSessionToken();
    expect(t1).not.toBe(newSessionToken());
    expect(t1.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(t1)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t1)).not.toContain(t1);
  });
});

describe("FR-09 role matrix (UI side)", () => {
  it("study group can view only", () => {
    for (const p of ["add", "edit", "del", "ai", "backup", "manageClasses", "manageUsers"] as const) expect(can("peer", p)).toBe(false);
    expect(can("peer", "view")).toBe(true);
  });
  it("lecturer can't delete students' work or export; builder can do everything", () => {
    expect(can("lecturer", "del")).toBe(false);
    expect(can("lecturer", "backup")).toBe(false);
    expect(can("lecturer", "manageClasses")).toBe(true);
    expect(Object.values(ROLES.builder.perm).every(Boolean)).toBe(true);
    expect(can(null, "view")).toBe(false);
  });
  it("builder is never offered at sign-up", () => {
    expect(SIGNUP_ROLES).not.toContain("builder");
  });
});

describe("form validation", () => {
  const ok = { email: "aisyah@example.com", password: "longenough", name: "Aisyah", role: "student", classCode: "" };
  it("accepts a valid sign-up", () => {
    expect(parseSignUp(form(ok))).toMatchObject({ ok: true, value: { email: "aisyah@example.com", role: "student" } });
  });
  it.each([
    [{ role: "builder" }, /Choose a role/],
    [{ name: "A" }, /at least 2/],
    [{ email: "nope" }, /valid email/],
    [{ password: "short" }, /at least 8/],
    [{ classCode: "bad code!" }, /4–32/],
    [{ name: "Aisyah 900101-14-5678" }, /IC or bank/],
    [{ classCode: "1234567890123" }, /IC or bank/],
  ])("rejects %o", (patch, msg) => {
    const r = parseSignUp(form({ ...ok, ...patch }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
  it("sign-in needs an email and a password", () => {
    expect(parseSignIn(form({ email: "a@b.co", password: "" })).ok).toBe(false);
    expect(parseSignIn(form({ email: "a@b.co", password: "x" })).ok).toBe(true);
  });
  it("new classes get an upper-case join code", () => {
    expect(parseNewClass(form({ name: "Crim 101", joinCode: "crim101-2026" }))).toEqual({ ok: true, value: { name: "Crim 101", joinCode: "CRIM101-2026" } });
    expect(parseNewClass(form({ name: "Crim 101", joinCode: "" })).ok).toBe(false);
  });
});
