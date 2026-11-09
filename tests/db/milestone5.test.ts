import { beforeAll, describe, expect, it } from "vitest";
import { makeDb } from "./harness";

// Milestone 5: flashcards, progress and quiz scores, as the app queries them (as caselab_app).
type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;
let student: string, other: string, peer: string;
let case16: string, case07: string;

const CARDS = `select f.id, f.front, f.source, p.box
  from flashcards f left join card_progress p on p.flashcard_id = f.id and p.user_id = $2
  where f.case_id = $1
  order by case f.source when 'seed' then 0 when 'derived' then 1 when 'lecturer' then 2 else 3 end, f.slot nulls last, f.created_at, f.id`;
const GRADE = `insert into card_progress (user_id, flashcard_id, box, due_at, updated_at) values ($1, $2, $3, now(), now())
  on conflict (user_id, flashcard_id) do update set box = excluded.box, due_at = excluded.due_at, updated_at = now()`;

beforeAll(async () => {
  t = await makeDb();
  student = await t.signUp({ display_name: "Aisyah" });
  other = await t.signUp({ display_name: "Ben" });
  peer = await t.signUp({ display_name: "Chen", requested_role: "peer" });
  [{ id: case16 }] = await t.q<{ id: string }>("select id from cases where code='16'");
  [{ id: case07 }] = await t.q<{ id: string }>("select id from cases where code='07'");
}, 60_000);

describe("FR-06 flashcards", () => {
  it("case 16: the 7 EXTRA cards come first, then the 4 cards built from the record", async () => {
    const rows = await t.as(student, () => t.q<{ front: string; source: string }>(CARDS, [case16, student]));
    expect(rows).toHaveLength(11);
    expect(rows.slice(0, 7).every((r) => r.source === "seed")).toBe(true);
    expect(rows[0].front).toBe("What was the 2008 non-prosecution agreement (NPA)?");
    expect(rows[7].front).toMatch(/^Where and when: .+\?$/);
    expect(rows.slice(8).map((r) => r.front)).toEqual([
      "What was the final legal outcome?",
      "Which criminology themes does it illustrate?",
      "Original verdict vs latest outcome — why separate them?",
    ]);
  });
  it("signed-out visitors can read the shared cards", async () => {
    expect(await t.as(null, () => t.q(CARDS, [case07, null]))).toHaveLength(4);
  });
  it("progress is per user, and study group keeps their own", async () => {
    const [card] = await t.as(student, () => t.q<{ id: string }>(CARDS, [case07, student]));
    await t.as(student, () => t.q(GRADE, [student, card.id, 2]));
    await t.as(peer, () => t.q(GRADE, [peer, card.id, 1]));
    const [s] = await t.as(student, () => t.q<{ box: number }>(CARDS, [case07, student]));
    const [p] = await t.as(peer, () => t.q<{ box: number }>(CARDS, [case07, peer]));
    const [o] = await t.as(other, () => t.q<{ box: number | null }>(CARDS, [case07, other]));
    expect([s.box, p.box, o.box]).toEqual([2, 1, null]);
    await expect(t.as(other, () => t.q(GRADE, [student, card.id, 5]))).rejects.toThrow(/row-level security/);
  });
  it("study group can't reset progress; a student can", async () => {
    const reset = `delete from card_progress where user_id = $1 and flashcard_id in (select id from flashcards where case_id = $2) returning 1`;
    expect(await t.as(peer, () => t.q(reset, [peer, case07]))).toHaveLength(0);
    expect(await t.as(student, () => t.q(reset, [student, case07]))).toHaveLength(1);
  });
  it("AI cards are private to their owner and replace the owner's earlier AI cards", async () => {
    const add = (front: string) => t.q("insert into flashcards (case_id, user_id, front, back, source) values ($1, $2, $3, 'back', 'ai')", [case07, student, front]);
    await t.as(student, () => add("AI 1"));
    await t.as(student, async () => {
      await t.q("delete from flashcards where case_id=$1 and user_id=$2 and source='ai'", [case07, student]);
      await add("AI 2");
    });
    const mine = await t.as(student, () => t.q<{ front: string; source: string }>(CARDS, [case07, student]));
    expect(mine.filter((r) => r.source === "ai").map((r) => r.front)).toEqual(["AI 2"]);
    expect(mine.at(-1)!.front).toBe("AI 2");
    expect(await t.as(other, () => t.q(CARDS, [case07, other]))).toHaveLength(4);
    await expect(t.as(peer, () => t.q("insert into flashcards (case_id, user_id, front, back, source) values ($1, $2, 'x', 'y', 'ai')", [case07, peer]))).rejects.toThrow(/row-level security/);
  });
});

describe("FR-07 quiz scores", () => {
  const SAVE = "insert into quiz_results (user_id, case_id, score, total) values ($1, $2, $3, $4)";
  it("saves a finished quiz and reads back only your own scores", async () => {
    await t.as(student, () => t.q(SAVE, [student, case07, 4, 5]));
    await t.as(peer, () => t.q(SAVE, [peer, case07, 2, 3]));
    const mine = await t.as(student, () => t.q<{ score: number; total: number }>("select score, total from quiz_results where case_id=$1 order by taken_at desc", [case07]));
    expect(mine).toEqual([{ score: 4, total: 5 }]);
  });
  it("refuses impossible scores and someone else's id", async () => {
    await expect(t.as(student, () => t.q(SAVE, [student, case07, 6, 5]))).rejects.toThrow(/check constraint/);
    await expect(t.as(student, () => t.q(SAVE, [other, case07, 1, 5]))).rejects.toThrow(/row-level security/);
  });
});
