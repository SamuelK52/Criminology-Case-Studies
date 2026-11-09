import { beforeAll, describe, expect, it } from "vitest";
import { makeDb } from "./harness";

// Milestone 3 queries, run exactly as the app runs them (as caselab_app).
type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;
let student: string, other: string, peer: string;
let case07: string;

const UPSERT = `insert into notes (case_id, user_id, body) values ($1, $2, $3)
  on conflict (case_id, user_id) do update set body = excluded.body, updated_at = now()`;

beforeAll(async () => {
  t = await makeDb();
  student = await t.signUp({ display_name: "Aisyah" });
  other = await t.signUp({ display_name: "Ben" });
  peer = await t.signUp({ display_name: "Chen", requested_role: "peer" });
  [{ id: case07 }] = await t.q<{ id: string }>("select id from cases where code='07'");
}, 60_000);

describe("notes autosave (upsert)", () => {
  it("creates, then updates, the student's one note per case", async () => {
    await t.as(student, () => t.q(UPSERT, [case07, student, "first draft"]));
    await t.as(student, () => t.q(UPSERT, [case07, student, "second draft"]));
    const rows = await t.as(student, () => t.q<{ body: string }>("select body from notes where case_id=$1", [case07]));
    expect(rows).toEqual([{ body: "second draft" }]);
  });
  it("can't write a note as someone else, and study group can't write notes", async () => {
    await expect(t.as(other, () => t.q(UPSERT, [case07, student, "hijack"]))).rejects.toThrow(/row-level security/);
    await expect(t.as(peer, () => t.q(UPSERT, [case07, peer, "x"]))).rejects.toThrow(/row-level security/);
    const [n] = await t.q<{ body: string }>("select body from notes where user_id=$1", [student]);
    expect(n.body).toBe("second draft");
  });
  it("refuses IC numbers in notes", async () => {
    await expect(t.as(student, () => t.q(UPSERT, [case07, student, "IC 900101-14-5678"]))).rejects.toThrow(/check constraint/);
  });
});

describe("own cases (FR-02 / FR-10)", () => {
  const add = (uid: string, name: string) =>
    t.as(uid, () => t.q<{ code: string }>("insert into cases (name, owner_id, needs_verify) values ($1, $2, true) returning code", [name, uid]));
  it("student adds a case; another student may add the same name to their own list", async () => {
    const [a] = await add(student, "Lindy Chamberlain case");
    expect(a.code).toMatch(/^U\d+$/);
    const [b] = await add(other, "Lindy Chamberlain case");
    expect(b.code).not.toBe(a.code);
  });
  it("rejects a duplicate in the same list, a shared-bank name, a short name and PII", async () => {
    await expect(add(student, "lindy chamberlain case")).rejects.toThrow(/cases_name_scope_key|already in the list/);
    await expect(add(student, "Birmingham Six case")).rejects.toThrow(/already in the list/);
    await expect(add(student, "ab")).rejects.toThrow(/check constraint/);
    await expect(add(student, "Case 900101-14-5678")).rejects.toThrow(/check constraint/);
  });
  it("study group can't add cases", async () => {
    await expect(add(peer, "Peer case")).rejects.toThrow(/row-level security/);
  });
  it("the AI token check is per user and caps at 20 per hour", async () => {
    for (let i = 0; i < 20; i++) {
      const [r] = await t.as(other, () => t.q<{ allowed: boolean }>("select * from ai_take_token('summary')"));
      expect(r.allowed).toBe(true);
    }
    const [r] = await t.as(other, () => t.q<{ allowed: boolean; retry_at: string | null }>("select * from ai_take_token('summary')"));
    expect(r.allowed).toBe(false);
    expect(r.retry_at).not.toBeNull();
    const [p] = await t.as(peer, () => t.q<{ allowed: boolean }>("select * from ai_take_token('summary')"));
    expect(p.allowed).toBe(false); // study group: no AI
  });
});
