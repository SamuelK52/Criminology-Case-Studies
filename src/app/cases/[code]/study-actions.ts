"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { friendlyDbError } from "@/lib/dberror";
import { can } from "@/lib/permissions";
import { nextReview } from "@/lib/study";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GradeResult = { box: number; dueAt: number } | { error: string };

/**
 * FR-06: record "Knew it" / "Missed it". The new box is worked out here from the stored box,
 * not sent by the browser. Every signed-in role keeps their own progress, study group included.
 */
export async function gradeCard(cardId: string, ok: boolean): Promise<GradeResult> {
  const v = await getViewer();
  if (!v) return { error: "Sign in to save your progress." };
  if (typeof cardId !== "string" || !UUID.test(cardId) || typeof ok !== "boolean") return { error: "Bad request." };
  try {
    return await withUser(v.id, async (tx) => {
      const [card] = await tx`select 1 from flashcards where id = ${cardId}`; // RLS: a card this user can see
      if (!card) return { error: "That card is no longer available." };
      const [p] = await tx<{ box: number }[]>`select box from card_progress where user_id = ${v.id} and flashcard_id = ${cardId}`;
      const next = nextReview(p?.box ?? 0, ok);
      await tx`
        insert into card_progress (user_id, flashcard_id, box, due_at, updated_at)
        values (${v.id}, ${cardId}, ${next.box}, ${new Date(next.dueAt)}, now())
        on conflict (user_id, flashcard_id) do update set box = excluded.box, due_at = excluded.due_at, updated_at = now()`;
      return next;
    });
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't save that card — your answer still counts on screen.") };
  }
}

/** "Reset progress" for one case. Hidden from study group (RLS refuses it too). */
export async function resetProgress(caseId: string): Promise<{ error: string | null }> {
  const v = await getViewer();
  if (!v) return { error: "Sign in first." };
  if (!can(v.role, "edit")) return { error: "Your role can't reset progress." };
  if (typeof caseId !== "string" || !UUID.test(caseId)) return { error: "Bad request." };
  try {
    await withUser(v.id, (tx) => tx`
      delete from card_progress
      where user_id = ${v.id} and flashcard_id in (select id from flashcards where case_id = ${caseId})`);
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't reset progress — try again.") };
  }
  revalidatePath("/cases", "layout");
  return { error: null };
}

/**
 * FR-07: save a finished quiz. The score is counted in the browser (AI quizzes aren't stored),
 * so the server only checks it is a sensible pair of numbers (DECISIONS #36).
 */
export async function saveQuizScore(caseId: string, score: number, total: number): Promise<{ error: string | null }> {
  const v = await getViewer();
  if (!v) return { error: "Sign in to save your score." };
  if (typeof caseId !== "string" || !UUID.test(caseId)) return { error: "Bad request." };
  if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 20 || score < 0 || score > total) {
    return { error: "Bad request." };
  }
  try {
    await withUser(v.id, (tx) => tx`insert into quiz_results (user_id, case_id, score, total) values (${v.id}, ${caseId}, ${score}, ${total})`);
  } catch (e) {
    return { error: friendlyDbError(e, "Couldn't save your score — try again.") };
  }
  revalidatePath("/cases", "layout");
  return { error: null };
}
