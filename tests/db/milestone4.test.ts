import { beforeAll, describe, expect, it } from "vitest";
import { makeDb } from "./harness";

// Milestone 4: resources as the app queries them (as caselab_app), including class sharing.
type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;
let student: string, outsider: string, peer: string, lecturer: string, builder: string;
let case01: string, cls: string;

const LIST = `select r.id, r.title, r.shared, r.class_id, cl.name as class_name, r.user_id
  from resources r left join classes cl on cl.id = r.class_id where r.case_id = $1 order by r.shared desc, r.created_at, r.id`;
const ADD = `insert into resources (case_id, user_id, title, kind, url, shared, class_id) values ($1, $2, $3, $4, $5, $6, $7) returning id`;

beforeAll(async () => {
  t = await makeDb();
  builder = await t.signUp({ display_name: "Builder" });
  await t.q("update profiles set role='builder' where id=$1", [builder]);
  lecturer = await t.signUp({ display_name: "Dr Devi", requested_role: "lecturer" });
  await t.as(builder, () => t.q("select set_user_role($1,'lecturer')", [lecturer]));
  [{ id: cls }] = await t.as(lecturer, () =>
    t.q<{ id: string }>("insert into classes (name, join_code, lecturer_id) values ('Crim 101', 'CRIM101-2026', $1) returning id", [lecturer]));
  student = await t.signUp({ display_name: "Aisyah", class_code: "CRIM101-2026" });
  peer = await t.signUp({ display_name: "Chen", requested_role: "peer", class_code: "CRIM101-2026" });
  outsider = await t.signUp({ display_name: "Ben" });
  [{ id: case01 }] = await t.q<{ id: string }>("select id from cases where code='01'");
}, 60_000);

describe("FR-04 resources", () => {
  it("edit a resource title and it updates", async () => {
    const [r] = await t.as(student, () => t.q<{ id: string }>(ADD, [case01, student, "Court of Appeal judgment", "Judgment", "", false, null]));
    await t.as(student, () => t.q("update resources set title='Federal Court judgment, 2026' where id=$1", [r.id]));
    const rows = await t.as(student, () => t.q<{ title: string }>(LIST, [case01]));
    expect(rows.map((x) => x.title)).toEqual(["Federal Court judgment, 2026"]);
  });
  it("a lecturer shares with their class: members (incl. study group) see it, outsiders don't", async () => {
    await t.as(lecturer, () => t.q(ADD, [case01, lecturer, "Week 3 lecture", "Lecture", "https://example.edu/w3", true, cls]));
    const mine = await t.as(student, () => t.q<{ title: string; class_name: string | null }>(LIST, [case01]));
    expect(mine.map((x) => [x.title, x.class_name])).toEqual([["Week 3 lecture", "Crim 101"], ["Federal Court judgment, 2026", null]]);
    expect((await t.as(peer, () => t.q<{ title: string }>(LIST, [case01]))).map((x) => x.title)).toEqual(["Week 3 lecture"]);
    expect(await t.as(outsider, () => t.q(LIST, [case01]))).toHaveLength(0);
  });
  it("students can't share, and lecturers can't share with a class they don't teach", async () => {
    await expect(t.as(student, () => t.q(ADD, [case01, student, "x", "Note", "", true, cls]))).rejects.toThrow(/row-level security/);
    const [other] = await t.as(builder, () =>
      t.q<{ id: string }>("insert into classes (name, join_code, lecturer_id) values ('Other', 'OTHER-2026', $1) returning id", [builder]));
    await expect(t.as(lecturer, () => t.q(ADD, [case01, lecturer, "x", "Note", "", true, other.id]))).rejects.toThrow(/row-level security/);
  });
  it("students can't change or remove the lecturer's shared resource; the lecturer can't remove students' work", async () => {
    const [shared] = await t.q<{ id: string }>("select id from resources where title='Week 3 lecture'");
    expect(await t.as(student, () => t.q("update resources set title='hacked' where id=$1 returning id", [shared.id]))).toHaveLength(0);
    expect(await t.as(student, () => t.q("delete from resources where id=$1 returning id", [shared.id]))).toHaveLength(0);
    const [own] = await t.q<{ id: string }>("select id from resources where user_id=$1", [student]);
    expect(await t.as(lecturer, () => t.q("delete from resources where id=$1 returning id", [own.id]))).toHaveLength(0);
    expect(await t.as(lecturer, () => t.q("update resources set title='Week 3 lecture (slides)' where id=$1 returning id", [shared.id]))).toHaveLength(1);
  });
  it("study group can't add resources; PII is refused by the database", async () => {
    await expect(t.as(peer, () => t.q(ADD, [case01, peer, "x", "Note", "", false, null]))).rejects.toThrow(/row-level security/);
    await expect(t.as(student, () => t.q(ADD, [case01, student, "IC 900101-14-5678", "Note", "", false, null]))).rejects.toThrow(/check constraint/);
  });
  it("builder shares with everyone; every signed-in user sees it, signed-out visitors don't", async () => {
    await t.as(builder, () => t.q(ADD, [case01, builder, "Inquiry report", "Article", "", true, null]));
    expect((await t.as(outsider, () => t.q<{ title: string }>(LIST, [case01]))).map((x) => x.title)).toEqual(["Inquiry report"]);
    expect(await t.as(null, () => t.q(LIST, [case01]))).toHaveLength(0);
  });
  it("taught-classes query returns only the lecturer's classes", async () => {
    const rows = await t.as(lecturer, () => t.q<{ name: string }>("select id, name from classes where lecturer_id = $1 or $2 order by name", [lecturer, false]));
    expect(rows.map((r) => r.name)).toEqual(["Crim 101"]);
  });
});
