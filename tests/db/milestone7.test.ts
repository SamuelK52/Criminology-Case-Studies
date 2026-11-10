import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeDb } from "./harness";

// Milestone 7: the app's own backup and progress code, run against PGlite as caselab_app.
// `withUser` is swapped for one that runs each call in a PGlite transaction with the user's id set.
type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;

vi.mock("@/lib/db", () => ({
  dbConfigured: () => true,
  SETUP_MESSAGE: "",
  withUser: <T,>(uid: string | null, fn: (tx: unknown) => Promise<T>) =>
    t.as(uid, () =>
      t.db.transaction(async (ptx) => {
        const tag = async (strings: TemplateStringsArray, ...vals: unknown[]) =>
          (await ptx.query(strings.reduce((sql, s, i) => sql + `$${i}` + s), vals)).rows;
        return fn(tag);
      }),
    ),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { exportBackup, importBackup, parseBackup } = await import("@/lib/backup");
const { loadProgress } = await import("@/lib/cases");
const { caseProgress, weakestThemes } = await import("@/lib/progress");

let student: string, other: string;
let case07: string, case14: string;

beforeAll(async () => {
  t = await makeDb();
  student = await t.signUp({ display_name: "Aisyah" });
  other = await t.signUp({ display_name: "Ben" });
  [{ id: case07 }] = await t.q<{ id: string }>("select id from cases where code='07'");
  [{ id: case14 }] = await t.q<{ id: string }>("select id from cases where code='14'");
}, 60_000);

const asStudent = (sql: string, params: unknown[] = []) => t.as(student, () => t.q(sql, params));

describe("FR-12 export and import", () => {
  it("export, delete one note, import, and the note is back", async () => {
    await asStudent("insert into notes (case_id, user_id, body) values ($1, $2, 'Confession was coerced')", [case07, student]);
    await asStudent("insert into notes (case_id, user_id, body) values ($1, $2, 'Forensic science failures')", [case14, student]);
    await asStudent("insert into resources (case_id, user_id, title, kind) values ($1, $2, 'Court opinion', 'Judgment')", [case07, student]);
    await asStudent("insert into cases (name, owner_id, focus) values ('My own case', $1, '{Policing}')", [student]);
    const [card] = await asStudent("select id from flashcards where case_id=$1 order by slot limit 1", [case07]) as { id: string }[];
    await asStudent("insert into card_progress (user_id, flashcard_id, box) values ($1, $2, 3)", [student, card.id]);
    await asStudent("insert into quiz_results (user_id, case_id, score, total) values ($1, $2, 2, 3)", [student, case07]);

    const backup = await exportBackup(student);
    expect(backup.notes).toHaveLength(2);
    expect(backup.cases.map((c) => c.name)).toEqual(["My own case"]);
    const text = JSON.stringify(backup);

    // "Delete" a note the way the app does (empty it), and remove another outright.
    await asStudent("update notes set body='' where case_id=$1 and user_id=$2", [case07, student]);
    await asStudent("delete from notes where case_id=$1 and user_id=$2", [case14, student]);

    const parsed = parseBackup(text);
    if (typeof parsed === "string") throw new Error(parsed);
    const sum = await importBackup(student, parsed);
    expect(sum).toMatchObject({ notes: 2, resources: 0, quizzes: 0, cases: 0, progress: 0, skipped: 0 });
    const notes = await asStudent("select body from notes where user_id=$1 order by body", [student]);
    expect(notes).toEqual([{ body: "Confession was coerced" }, { body: "Forensic science failures" }]);
  });

  it("importing again changes nothing (duplicates are skipped)", async () => {
    const parsed = parseBackup(JSON.stringify(await exportBackup(student)));
    if (typeof parsed === "string") throw new Error(parsed);
    expect(await importBackup(student, parsed)).toMatchObject({ cases: 0, notes: 0, resources: 0, aiCards: 0, progress: 0, quizzes: 0 });
  });

  it("keeps a newer note over the backup's older copy", async () => {
    const parsed = parseBackup(JSON.stringify(await exportBackup(student)));
    if (typeof parsed === "string") throw new Error(parsed);
    await asStudent("update notes set body='Newer thinking' where case_id=$1 and user_id=$2", [case07, student]);
    await importBackup(student, parsed);
    const [n] = await asStudent("select body from notes where case_id=$1 and user_id=$2", [case07, student]);
    expect(n).toEqual({ body: "Newer thinking" });
  });

  it("restores everything into an empty account, re-creating own cases", async () => {
    const parsed = parseBackup(JSON.stringify(await exportBackup(student)));
    if (typeof parsed === "string") throw new Error(parsed);
    const sum = await importBackup(other, parsed);
    expect(sum).toMatchObject({ cases: 1, notes: 2, resources: 1, progress: 1, quizzes: 1 });
    const own = await t.as(other, () => t.q<{ name: string; code: string }>("select name, code from cases where owner_id=$1", [other]));
    expect(own.map((c) => c.name)).toEqual(["My own case"]);
    expect(own[0].code).toMatch(/^U\d+$/);
  });

  it("refuses bad input, and rolls back a whole import if any item is refused (PII)", async () => {
    expect(parseBackup("not json")).toMatch(/isn't a CaseLab backup/);
    expect(parseBackup(JSON.stringify({ caselab: 1, data: {} }))).toMatch(/old single-page prototype/);
    const good = JSON.parse(JSON.stringify(await exportBackup(student)));
    good.notes.push({ caseId: case14, caseCode: "14", body: "IC 900101-14-5678", updatedAt: new Date().toISOString() });
    good.resources.push({ caseId: case14, caseCode: "14", title: "Fresh resource", kind: "Note", url: "" });
    await asStudent("delete from notes where case_id=$1 and user_id=$2", [case14, student]);
    const parsed = parseBackup(JSON.stringify(good));
    if (typeof parsed === "string") throw new Error(parsed);
    await expect(importBackup(student, parsed)).rejects.toThrow(/check constraint/);
    expect(await asStudent("select 1 from resources where title='Fresh resource'")).toHaveLength(0);
  });

  it("export holds only your own data", async () => {
    const fresh = await t.signUp({ display_name: "Dina" });
    const b = await exportBackup(fresh);
    expect([b.cases, b.notes, b.resources, b.aiCards, b.progress, b.quizzes].every((x) => x.length === 0)).toBe(true);
  });
});

describe("FR-11 progress", () => {
  it("review cards: the weakest theme is listed first", async () => {
    const rows = (await loadProgress(student)).map(caseProgress);
    const c07 = rows.find((r) => r.code === "07")!;
    expect(c07).toMatchObject({ cards: 4, seen: 1, known: 1, runs: 1, score: 2, total: 3 });
    expect(c07.cardPct).toBe(25);
    expect(c07.quizPct).toBe(67);
    const themes = weakestThemes(rows);
    expect(themes.length).toBeGreaterThan(0);
    for (let i = 1; i < themes.length; i++) expect(themes[i].pct).toBeGreaterThanOrEqual(themes[i - 1].pct);
    expect(rows.find((r) => r.code === "01")!.touched).toBe(false);
  });
});
