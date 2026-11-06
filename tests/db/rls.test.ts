import { beforeAll, describe, expect, it } from "vitest";
import { makeDb } from "./harness";

type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;
let student: string, student2: string, peer: string, lecturer: string, builder: string;
const caseId = async (code: string) => (await t.q<{ id: string }>("select id from cases where code=$1", [code]))[0].id;

beforeAll(async () => {
  t = await makeDb();
  student = await t.signUp({ display_name: "Aisyah", requested_role: "student" });
  student2 = await t.signUp({ display_name: "Ben", requested_role: "student" });
  peer = await t.signUp({ display_name: "Chen", requested_role: "peer" });
  lecturer = await t.signUp({ display_name: "Dr Devi", requested_role: "lecturer" });
  builder = await t.signUp({ display_name: "Builder", requested_role: "builder" });
  await t.q("update profiles set role='builder' where id=$1", [builder]); // README: first builder via SQL
}, 60_000);

describe("seed", () => {
  it("has the 16 cases with exact text", async () => {
    const rows = await t.q<{ code: string; name: string }>("select code, name from cases order by code");
    expect(rows).toHaveLength(16);
    expect(rows[6]).toEqual({ code: "07", name: "Central Park Five case" });
    const [c16] = await t.q<{ focus: string[] }>("select focus from cases where code='16'");
    expect(c16.focus).toContain("victims' rights");
  });
  it("builds derived cards and case 16's 7 extra cards", async () => {
    const [{ n }] = await t.q<{ n: number }>("select count(*)::int n from flashcards f join cases c on c.id=f.case_id where c.code='16'");
    expect(n).toBe(11);
    const [{ m }] = await t.q<{ m: number }>("select count(*)::int m from flashcards f join cases c on c.id=f.case_id where c.code='07'");
    expect(m).toBe(4);
  });
  it("is safe to re-run", async () => {
    const { readFileSync } = await import("node:fs");
    await t.db.exec(readFileSync("db/seed.sql", "utf8"));
    expect((await t.q("select 1 from cases")).length).toBe(16);
  });
  it("migrations are safe to re-run (pre-deploy runs them on every deploy)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    for (const f of readdirSync("db/migrations").sort()) await t.db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
    expect((await t.q("select 1 from cases")).length).toBe(16);
  });
});

describe("credentials & sessions", () => {
  it("app role cannot read users or sessions directly", async () => {
    await expect(t.as(student, () => t.q("select * from users"))).rejects.toThrow(/permission denied/);
    await expect(t.as(student, () => t.q("select * from sessions"))).rejects.toThrow(/permission denied/);
  });
  it("rejects a duplicate email and an unknown class code at sign-up", async () => {
    await expect(t.signUp({ display_name: "Aisyah" })).rejects.toThrow(/already exists/);
    await expect(t.signUp({ display_name: "Zed", class_code: "NOPE-0000" })).rejects.toThrow(/No class/);
  });
  it("login lookup, session create / resolve / delete", async () => {
    const [login] = await t.as(null, () => t.q<{ id: string }>("select * from get_login('AISYAH@test.local')"));
    expect(login.id).toBe(student);
    await t.as(null, () => t.q("select create_session($1, 'tok-hash-1', 30)", [student]));
    const [r] = await t.as(null, () => t.q<{ uid: string }>("select resolve_session('tok-hash-1') uid"));
    expect(r.uid).toBe(student);
    await t.as(null, () => t.q("select delete_session('tok-hash-1')"));
    const [gone] = await t.as(null, () => t.q<{ uid: string | null }>("select resolve_session('tok-hash-1') uid"));
    expect(gone.uid).toBeNull();
  });
  it("expired sessions don't resolve", async () => {
    await t.q("insert into sessions (token_hash, user_id, expires_at) values ('old', $1, now() - interval '1 minute')", [student]);
    const [r] = await t.as(null, () => t.q<{ uid: string | null }>("select resolve_session('old') uid"));
    expect(r.uid).toBeNull();
  });
});

describe("sign-up", () => {
  it("never self-assigns lecturer or builder", async () => {
    const rows = await t.q<{ role: string; requested_role: string | null }>(
      "select role, requested_role from profiles where id = any($1) order by display_name", [[lecturer, student]]);
    expect(rows).toEqual([{ role: "student", requested_role: null }, { role: "student", requested_role: "lecturer" }]);
    const [p] = await t.q<{ role: string }>("select role from profiles where id=$1", [peer]);
    expect(p.role).toBe("peer");
  });
  it("users cannot change their own role", async () => {
    await expect(t.as(student, () => t.q("update profiles set role='builder' where id=$1", [student]))).rejects.toThrow(/permission denied/);
    await expect(t.as(student, () => t.q("select set_user_role($1,'builder')", [student]))).rejects.toThrow(/Only the builder/);
  });
  it("builder approves the lecturer request", async () => {
    await t.as(builder, () => t.q("select set_user_role($1,'lecturer')", [lecturer]));
    const [p] = await t.q<{ role: string; requested_role: string | null }>("select role, requested_role from profiles where id=$1", [lecturer]);
    expect(p).toEqual({ role: "lecturer", requested_role: null });
  });
});

describe("cases", () => {
  it("signed-out visitors can read the shared bank (Milestone 1 case list)", async () => {
    const rows = await t.as(null, () => t.q("select code from cases"));
    expect(rows).toHaveLength(16);
  });
  it("student adds own case: code assigned, owner forced, private", async () => {
    const [c] = await t.as(student, () =>
      t.q<{ code: string; owner_id: string }>("insert into cases (name, owner_id) values ('Lindy Chamberlain', $1) returning code, owner_id", [student2]));
    expect(c.code).toMatch(/^U\d+$/);
    expect(c.owner_id).toBe(student);
    expect(await t.as(student2, () => t.q("select 1 from cases where name='Lindy Chamberlain'"))).toHaveLength(0);
  });
  it("rejects duplicates and IC numbers", async () => {
    await expect(t.as(student, () => t.q("insert into cases (name) values ('central park five case')"))).rejects.toThrow(/already in the list/);
    await expect(t.as(student, () => t.q("insert into cases (name) values ('Case 900101-14-5678')"))).rejects.toThrow(/check constraint/);
  });
  it("study group cannot add cases", async () => {
    await expect(t.as(peer, () => t.q("insert into cases (name) values ('Peer case')"))).rejects.toThrow(/row-level security/);
  });
  it("student cannot edit or delete shared cases", async () => {
    const id = await caseId("10");
    expect(await t.as(student, () => t.q("update cases set latest_outcome='x' where id=$1 returning 1", [id]))).toHaveLength(0);
    expect(await t.as(student, () => t.q("delete from cases where id=$1 returning 1", [id]))).toHaveLength(0);
  });
  it("FR-13: lecturer corrects case 10; students see it and the derived card updates", async () => {
    const id = await caseId("10");
    await t.as(lecturer, () => t.q("update cases set latest_outcome='Updated by lecturer', needs_verify=true where id=$1", [id]));
    const [c] = await t.as(student, () => t.q<{ latest_outcome: string }>("select latest_outcome from cases where id=$1", [id]));
    expect(c.latest_outcome).toBe("Updated by lecturer");
    const [card] = await t.as(student, () => t.q<{ back: string }>("select back from flashcards where case_id=$1 and slot=102", [id]));
    expect(card.back).toBe("Updated by lecturer");
    expect(await t.as(lecturer, () => t.q("delete from cases where id=$1 returning 1", [id]))).toHaveLength(0);
  });
  it("lecturer cannot take ownership of a shared case", async () => {
    const id = await caseId("09");
    await t.as(lecturer, () => t.q("update cases set owner_id=$2 where id=$1", [id, lecturer]));
    const [c] = await t.q<{ owner_id: string | null }>("select owner_id from cases where id=$1", [id]);
    expect(c.owner_id).toBeNull();
  });
});

describe("notes, resources, progress", () => {
  it("notes are private and refuse PII", async () => {
    const id = await caseId("07");
    await t.as(student, () => t.q("insert into notes (case_id, body) values ($1, 'my notes')", [id]));
    expect(await t.as(student2, () => t.q("select 1 from notes"))).toHaveLength(0);
    expect(await t.as(lecturer, () => t.q("select 1 from notes"))).toHaveLength(0);
    await expect(t.as(student2, () => t.q("insert into notes (case_id, body) values ($1, 'card 4111111111111111')", [id]))).rejects.toThrow(/check constraint/);
  });
  it("study group: read-only content, but own card progress and quiz scores", async () => {
    const id = await caseId("07");
    await expect(t.as(peer, () => t.q("insert into notes (case_id, body) values ($1, 'x')", [id]))).rejects.toThrow(/row-level security/);
    await expect(t.as(peer, () => t.q("insert into resources (case_id, title) values ($1, 'x')", [id]))).rejects.toThrow(/row-level security/);
    const [card] = await t.as(peer, () => t.q<{ id: string }>("select id from flashcards where case_id=$1 limit 1", [id]));
    await t.as(peer, () => t.q("insert into card_progress (flashcard_id, box) values ($1, 1)", [card.id]));
    await t.as(peer, () => t.q("insert into quiz_results (case_id, score, total) values ($1, 2, 3)", [id]));
    expect(await t.as(peer, () => t.q("delete from card_progress returning 1"))).toHaveLength(0);
  });
  it("student resources: full CRUD on own, invisible to others", async () => {
    const id = await caseId("06");
    const [r] = await t.as(student, () => t.q<{ id: string }>("insert into resources (case_id, title, kind) values ($1, 'Macpherson report', 'Article') returning id", [id]));
    await t.as(student, () => t.q("update resources set title='Macpherson Report (1999)' where id=$1", [r.id]));
    expect(await t.as(student2, () => t.q("select 1 from resources where id=$1", [r.id]))).toHaveLength(0);
    expect(await t.as(lecturer, () => t.q("delete from resources where id=$1 returning 1", [r.id]))).toHaveLength(0);
    expect(await t.as(student, () => t.q("delete from resources where id=$1 returning 1", [r.id]))).toHaveLength(1);
  });
});

describe("classes", () => {
  it("lecturer class: members see class cases, outsiders don't", async () => {
    const [cls] = await t.as(lecturer, () =>
      t.q<{ id: string }>("insert into classes (name, join_code, lecturer_id) values ('Crim 101', 'CRIM101-2026', $1) returning id", [lecturer]));
    await t.as(lecturer, () => t.q("insert into cases (name, class_id) values ('Class-only case', $1)", [cls.id]));
    await t.as(student2, () => t.q("select join_class('crim101-2026')"));
    expect(await t.as(student2, () => t.q("select 1 from cases where name='Class-only case'"))).toHaveLength(1);
    expect(await t.as(student, () => t.q("select 1 from cases where name='Class-only case'"))).toHaveLength(0);
    await expect(t.as(student, () => t.q("select join_class('NOPE-0000')"))).rejects.toThrow(/No class/);
    await expect(t.as(student, () => t.q("insert into classes (name, join_code, lecturer_id) values ('x', 'ABCD', $1)", [student]))).rejects.toThrow(/row-level security/);
  });
  it("sign-up with a class code joins the class", async () => {
    const u = await t.signUp({ display_name: "Eve", requested_role: "peer", class_code: "CRIM101-2026" });
    const [p] = await t.q<{ class_id: string | null }>("select class_id from profiles where id=$1", [u]);
    expect(p.class_id).not.toBeNull();
    expect(await t.as(null, () => t.q<{ ok: boolean }>("select class_code_exists('crim101-2026') ok"))).toEqual([{ ok: true }]);
  });
});

describe("AI rate limit", () => {
  it("allows 20 per hour, then refuses with a retry time", async () => {
    for (let i = 0; i < 20; i++) {
      const [r] = await t.as(student, () => t.q<{ allowed: boolean }>("select * from ai_take_token('summary')"));
      expect(r.allowed).toBe(true);
    }
    const [r] = await t.as(student, () => t.q<{ allowed: boolean; retry_at: string }>("select * from ai_take_token('summary')"));
    expect(r.allowed).toBe(false);
    expect(r.retry_at).toBeTruthy();
  });
  it("refuses the study group", async () => {
    const [r] = await t.as(peer, () => t.q<{ allowed: boolean }>("select * from ai_take_token('summary')"));
    expect(r.allowed).toBe(false);
  });
  it("users cannot write ai_usage directly", async () => {
    await expect(t.as(student2, () => t.q("insert into ai_usage (user_id, task) values ($1,'x')", [student2]))).rejects.toThrow(/permission denied/);
  });
});
