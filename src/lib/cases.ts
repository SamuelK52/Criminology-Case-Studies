import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { SETUP_MESSAGE, dbConfigured, withUser } from "@/lib/db";
import type { ResourceRow } from "@/lib/resources";
import type { CaseProgressRow } from "@/lib/progress";
import type { StudyCard } from "@/lib/study";
import type { CaseRow } from "@/lib/types";

export type CaseLoad = { cases: CaseRow[]; error: string | null };

/** All cases the current user may see (RLS filters): shared bank, then class cases, then their own. */
export const loadCases = cache(async (userId: string | null = null): Promise<CaseLoad> => {
  await connection(); // request-time only: never query the database during `next build`
  if (!dbConfigured()) return { cases: [], error: SETUP_MESSAGE };
  try {
    const cases = await withUser(userId, (tx) => tx<CaseRow[]>`
      select id, code, name, jurisdiction, focus, overview, original_verdict, latest_outcome,
             needs_verify, owner_id, class_id, updated_at
      from cases
      order by (owner_id is not null), (class_id is not null), length(code), code`);
    return { cases: [...cases], error: null };
  } catch (e) {
    console.error("loadCases failed", e);
    return { cases: [], error: "Couldn't load the case bank — the database didn't respond. Try again in a moment." };
  }
});

/** One case by its code, if this user may see it (RLS). Reuses the per-request case list. */
export async function loadCase(code: string, userId: string | null) {
  const all = await loadCases(userId);
  return { c: all.cases.find((x) => x.code.toUpperCase() === code.toUpperCase()) ?? null, all };
}

/** The user's own notes for a case (private to them by RLS). */
export async function loadNote(caseId: string, userId: string): Promise<string> {
  const [row] = await withUser(userId, (tx) => tx<{ body: string }[]>`
    select body from notes where case_id = ${caseId} and user_id = ${userId}`);
  return row?.body ?? "";
}

/** Resources for a case this user may see (RLS): their own, plus ones shared with their class or everyone. */
export async function loadResources(caseId: string, userId: string): Promise<ResourceRow[]> {
  const rows = await withUser(userId, (tx) => tx<ResourceRow[]>`
    select r.id, r.title, r.kind, r.url, r.shared, r.class_id, cl.name as class_name, r.user_id
    from resources r left join classes cl on cl.id = r.class_id
    where r.case_id = ${caseId}
    order by r.shared desc, r.created_at, r.id`);
  return [...rows];
}

/** Classes this user teaches (a builder may share with any class). Used for the "Share with" choice. */
export async function loadTaughtClasses(userId: string, role: string): Promise<{ id: string; name: string }[]> {
  if (role !== "lecturer" && role !== "builder") return [];
  const rows = await withUser(userId, (tx) => tx<{ id: string; name: string }[]>`
    select id, name from classes where lecturer_id = ${userId} or ${role === "builder"} order by name`);
  return [...rows];
}

/**
 * Flashcards for a case with this user's progress: hand-written seed cards first, then the cards
 * derived from the case record, lecturer cards, then the user's own AI cards (prototype order).
 * Signed-out visitors get the shared cards with no progress.
 */
export async function loadCards(caseId: string, userId: string | null): Promise<StudyCard[]> {
  const rows = await withUser(userId, (tx) => tx<{ id: string; front: string; back: string; source: string; box: number | null; due_at: Date | null }[]>`
    select f.id, f.front, f.back, f.source, p.box, p.due_at
    from flashcards f
    left join card_progress p on p.flashcard_id = f.id and p.user_id = ${userId}
    where f.case_id = ${caseId}
    order by case f.source when 'seed' then 0 when 'derived' then 1 when 'lecturer' then 2 else 3 end,
             f.slot nulls last, f.created_at, f.id`);
  return rows.map((r) => ({ id: r.id, front: r.front, back: r.back, source: r.source, box: r.box, dueAt: r.due_at ? r.due_at.getTime() : null }));
}

export type QuizScore = { score: number; total: number; takenAt: number };

/** This user's latest quiz scores for a case (newest first). */
export async function loadQuizScores(caseId: string, userId: string, limit = 5): Promise<QuizScore[]> {
  const rows = await withUser(userId, (tx) => tx<{ score: number; total: number; taken_at: Date }[]>`
    select score, total, taken_at from quiz_results
    where case_id = ${caseId} and user_id = ${userId}
    order by taken_at desc limit ${limit}`);
  return rows.map((r) => ({ score: r.score, total: r.total, takenAt: r.taken_at.getTime() }));
}

/** FR-11: per-case card and quiz counts for this user, over every case they can see (RLS). */
export async function loadProgress(userId: string): Promise<CaseProgressRow[]> {
  const rows = await withUser(userId, (tx) => tx<CaseProgressRow[]>`
    select c.code, c.name, c.focus,
           count(f.id)::int as cards,
           count(p.flashcard_id)::int as seen,
           (count(*) filter (where p.box >= 3))::int as known,
           (count(f.id) filter (where p.flashcard_id is null or p.due_at <= now()))::int as due,
           coalesce(q.runs, 0)::int as runs, coalesce(q.score, 0)::int as score, coalesce(q.total, 0)::int as total
    from cases c
    left join flashcards f on f.case_id = c.id
    left join card_progress p on p.flashcard_id = f.id and p.user_id = ${userId}
    left join (select case_id, count(*) runs, sum(score) score, sum(total) total
               from quiz_results where user_id = ${userId} group by case_id) q on q.case_id = c.id
    group by c.id, q.runs, q.score, q.total
    order by (c.owner_id is not null), (c.class_id is not null), length(c.code), c.code`);
  return [...rows];
}
