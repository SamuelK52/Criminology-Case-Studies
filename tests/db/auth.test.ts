import { beforeAll, describe, expect, it } from "vitest";
import { makeDb } from "./harness";

// Milestone 2: sign-in throttling, admin user list, classes and join codes — all as caselab_app.
type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;
let student: string, peer: string, lecturer: string, builder: string, other: string;

beforeAll(async () => {
  t = await makeDb();
  student = await t.signUp({ display_name: "Aisyah" });
  peer = await t.signUp({ display_name: "Chen", requested_role: "peer" });
  lecturer = await t.signUp({ display_name: "Dr Devi", requested_role: "lecturer" });
  other = await t.signUp({ display_name: "Dr Other", requested_role: "lecturer" });
  builder = await t.signUp({ display_name: "Builder" });
  await t.q("update profiles set role='builder' where id=$1", [builder]); // README: first builder via db:setup --builder
}, 60_000);

describe("sign-in throttling", () => {
  it("allows 10 failures in 15 minutes, then refuses until a success clears them", async () => {
    const allowed = async () =>
      (await t.as(null, () => t.q<{ ok: boolean }>("select login_allowed('Victim@test.local') ok")))[0].ok;
    expect(await allowed()).toBe(true);
    for (let i = 0; i < 10; i++) await t.as(null, () => t.q("select login_failed('victim@test.local')"));
    expect(await allowed()).toBe(false);
    // Other emails are unaffected.
    expect((await t.as(null, () => t.q<{ ok: boolean }>("select login_allowed('someone@test.local') ok")))[0].ok).toBe(true);
    await t.as(null, () => t.q("select login_succeeded('VICTIM@test.local')"));
    expect(await allowed()).toBe(true);
  });
  it("old failures don't count", async () => {
    await t.q("insert into login_failures (email, created_at) select 'old@test.local', now() - interval '20 minutes' from generate_series(1, 12)");
    expect((await t.as(null, () => t.q<{ ok: boolean }>("select login_allowed('old@test.local') ok")))[0].ok).toBe(true);
  });
  it("app role cannot read the failures table", async () => {
    await expect(t.as(student, () => t.q("select * from login_failures"))).rejects.toThrow(/permission denied/);
  });
});

describe("admin", () => {
  it("only the builder can list accounts (with emails)", async () => {
    await expect(t.as(student, () => t.q("select * from admin_list_users()"))).rejects.toThrow(/Only the builder/);
    await expect(t.as(lecturer, () => t.q("select * from admin_list_users()"))).rejects.toThrow(/Only the builder/);
    const rows = await t.as(builder, () => t.q<{ email: string; requested_role: string | null }>("select * from admin_list_users()"));
    expect(rows.map((r) => r.email)).toContain("aisyah@test.local");
    // Pending lecturer requests are listed first.
    expect(rows[0].requested_role).toBe("lecturer");
  });
  it("builder approves a lecturer; only builders can change roles", async () => {
    await expect(t.as(lecturer, () => t.q("select set_user_role($1, 'lecturer')", [lecturer]))).rejects.toThrow(/Only the builder/);
    await t.as(builder, () => t.q("select set_user_role($1, 'lecturer')", [lecturer]));
    const [p] = await t.q<{ role: string; requested_role: string | null }>("select role, requested_role from profiles where id=$1", [lecturer]);
    expect(p).toEqual({ role: "lecturer", requested_role: null });
  });
  it("the last builder can't demote themselves", async () => {
    await expect(t.as(builder, () => t.q("select set_user_role($1, 'student')", [builder]))).rejects.toThrow(/only builder/);
  });
});

describe("classes and join codes", () => {
  it("a pending lecturer (still a student) and study group can't create classes", async () => {
    await expect(t.as(other, () => t.q("insert into classes (name, join_code, lecturer_id) values ('X', 'XCLASS-1', $1)", [other]))).rejects.toThrow(/row-level security/);
    await expect(t.as(peer, () => t.q("insert into classes (name, join_code, lecturer_id) values ('Y', 'YCLASS-1', $1)", [peer]))).rejects.toThrow(/row-level security/);
  });
  it("a lecturer can't create a class in someone else's name", async () => {
    await expect(t.as(lecturer, () => t.q("insert into classes (name, join_code, lecturer_id) values ('Z', 'ZCLASS-1', $1)", [builder]))).rejects.toThrow(/row-level security/);
  });
  it("lecturer creates a class; join codes are unique regardless of case", async () => {
    await t.as(lecturer, () => t.q("insert into classes (name, join_code, lecturer_id) values ('Criminology 101', 'CRIM101-2026', $1)", [lecturer]));
    await expect(t.as(builder, () => t.q("insert into classes (name, join_code, lecturer_id) values ('Copy', 'crim101-2026', $1)", [builder]))).rejects.toThrow(/classes_join_code_key/);
  });
  it("sign-up with a class code joins the class (any letter case)", async () => {
    const id = await t.signUp({ display_name: "Farah", class_code: "crim101-2026" });
    const [p] = await t.q<{ join_code: string }>("select c.join_code from profiles p join classes c on c.id=p.class_id where p.id=$1", [id]);
    expect(p.join_code).toBe("CRIM101-2026");
  });
  it("students and study group join and leave with a code", async () => {
    await t.as(peer, () => t.q("select join_class(' CRIM101-2026 ')"));
    await expect(t.as(student, () => t.q("select join_class('NOPE-1234')"))).rejects.toThrow(/No class/);
    await t.as(student, () => t.q("select join_class('CRIM101-2026')"));
    const mine = await t.as(student, () => t.q<{ name: string }>("select name from classes"));
    expect(mine.map((c) => c.name)).toEqual(["Criminology 101"]);
    await t.as(student, () => t.q("select leave_class()"));
    expect(await t.as(student, () => t.q("select name from classes"))).toHaveLength(0);
  });
  it("users can't move themselves into a class by editing their profile", async () => {
    await expect(t.as(student, () => t.q("update profiles set class_id = (select id from classes limit 1) where id=$1", [student]))).rejects.toThrow(/permission denied/);
  });
  it("the lecturer sees their members; another student doesn't", async () => {
    const seen = await t.as(lecturer, () => t.q<{ display_name: string }>("select display_name from profiles where class_id is not null order by 1"));
    expect(seen.map((r) => r.display_name)).toEqual(["Chen", "Farah"]);
    const asStudent = await t.as(student, () => t.q("select 1 from profiles where id <> $1", [student]));
    expect(asStudent).toHaveLength(0);
  });
  it("only the class's lecturer (or builder) can delete it; members are kept", async () => {
    expect(await t.as(other, () => t.q("delete from classes where join_code='CRIM101-2026' returning 1"))).toHaveLength(0);
    expect(await t.as(lecturer, () => t.q("delete from classes where join_code='CRIM101-2026' returning 1"))).toHaveLength(1);
    const [p] = await t.q<{ class_id: string | null }>("select class_id from profiles where id=$1", [peer]);
    expect(p.class_id).toBeNull();
  });
});
