import "server-only";
import { withUser } from "@/lib/db";

// FR-12: export all of a student's own data as JSON, and import it back. Import merges and never
// deletes: a missing or emptied note comes back, a newer note is kept, duplicates are skipped.
// Everything is written as the user, so RLS and the PII check constraints apply as usual.

export const BACKUP_VERSION = 2; // 1 was the prototype's localStorage dump
export const MAX_BACKUP_BYTES = 2_000_000;
const MAX_ITEMS = 5000;

type CaseRef = { caseId: string; caseCode: string };
export type Backup = {
  caselab: number;
  exportedAt: string;
  cases: (CaseRef & { name: string; jurisdiction: string | null; focus: string[]; overview: string | null; original_verdict: string | null; latest_outcome: string | null })[];
  notes: (CaseRef & { body: string; updatedAt: string })[];
  resources: (CaseRef & { title: string; kind: string; url: string })[];
  aiCards: (CaseRef & { cardId: string; front: string; back: string })[];
  progress: (CaseRef & { cardId: string; front: string; box: number; dueAt: string; updatedAt: string })[];
  quizzes: (CaseRef & { score: number; total: number; takenAt: string })[];
};

const iso = (d: Date) => d.toISOString();

export async function exportBackup(userId: string): Promise<Backup> {
  return withUser(userId, async (tx) => {
    const cases = await tx<Backup["cases"]>`
      select id as "caseId", code as "caseCode", name, jurisdiction, focus, overview, original_verdict, latest_outcome
      from cases where owner_id = ${userId} order by created_at`;
    const notes = await tx<{ caseId: string; caseCode: string; body: string; updated_at: Date }[]>`
      select n.case_id as "caseId", c.code as "caseCode", n.body, n.updated_at
      from notes n join cases c on c.id = n.case_id where n.user_id = ${userId} and n.body <> '' order by c.code`;
    const resources = await tx<Backup["resources"]>`
      select r.case_id as "caseId", c.code as "caseCode", r.title, r.kind, r.url
      from resources r join cases c on c.id = r.case_id
      where r.user_id = ${userId} and not r.shared order by c.code, r.created_at`;
    const aiCards = await tx<Backup["aiCards"]>`
      select f.case_id as "caseId", c.code as "caseCode", f.id as "cardId", f.front, f.back
      from flashcards f join cases c on c.id = f.case_id
      where f.user_id = ${userId} and f.source = 'ai' order by c.code, f.created_at`;
    const progress = await tx<{ caseId: string; caseCode: string; cardId: string; front: string; box: number; due_at: Date; updated_at: Date }[]>`
      select f.case_id as "caseId", c.code as "caseCode", p.flashcard_id as "cardId", f.front, p.box, p.due_at, p.updated_at
      from card_progress p join flashcards f on f.id = p.flashcard_id join cases c on c.id = f.case_id
      where p.user_id = ${userId} order by c.code`;
    const quizzes = await tx<{ caseId: string; caseCode: string; score: number; total: number; taken_at: Date }[]>`
      select q.case_id as "caseId", c.code as "caseCode", q.score, q.total, q.taken_at
      from quiz_results q join cases c on c.id = q.case_id where q.user_id = ${userId} order by q.taken_at`;
    return {
      caselab: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      cases: [...cases],
      notes: notes.map(({ updated_at, ...n }) => ({ ...n, updatedAt: iso(updated_at) })),
      resources: [...resources],
      aiCards: [...aiCards],
      progress: progress.map(({ due_at, updated_at, ...p }) => ({ ...p, dueAt: iso(due_at), updatedAt: iso(updated_at) })),
      quizzes: quizzes.map(({ taken_at, ...q }) => ({ ...q, takenAt: iso(taken_at) })),
    };
  });
}

// ---------------------------------------------------------------- parsing

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isStr = (x: unknown, max = 50000): x is string => typeof x === "string" && x.length <= max;
const isDate = (x: unknown): x is string => isStr(x, 40) && !Number.isNaN(Date.parse(x));
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isRef = (x: Record<string, unknown>) => isStr(x.caseId, 36) && UUID.test(x.caseId) && isStr(x.caseCode, 20);

function list<T>(v: unknown, ok: (x: Record<string, unknown>) => boolean): T[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return null;
  return v.every((x) => x && typeof x === "object" && ok(x as Record<string, unknown>)) ? (v as T[]) : null;
}

/** Check a pasted or uploaded backup. Returns the backup, or a message saying what is wrong. */
export function parseBackup(text: string): Backup | string {
  const notBackup = "That isn't a CaseLab backup. Paste the full text from Download backup, or choose the .json file.";
  if (text.length > MAX_BACKUP_BYTES) return "That backup is too large (over 2 MB).";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return notBackup;
  }
  if (!raw || typeof raw !== "object") return notBackup;
  const o = raw as Record<string, unknown>;
  if (o.caselab === 1) return "That's a backup from the old single-page prototype. It can't be imported here — copy your notes across by hand.";
  if (o.caselab !== BACKUP_VERSION) return notBackup;
  const cases = list<Backup["cases"][number]>(o.cases, (x) => isRef(x) && isStr(x.name, 120) && Array.isArray(x.focus) && x.focus.every((f) => isStr(f, 200)));
  const notes = list<Backup["notes"][number]>(o.notes, (x) => isRef(x) && isStr(x.body) && isDate(x.updatedAt));
  const resources = list<Backup["resources"][number]>(o.resources, (x) => isRef(x) && isStr(x.title, 200) && isStr(x.kind, 20) && isStr(x.url, 1000));
  const aiCards = list<Backup["aiCards"][number]>(o.aiCards, (x) => isRef(x) && isStr(x.cardId, 36) && isStr(x.front, 500) && isStr(x.back, 2000));
  const progress = list<Backup["progress"][number]>(o.progress, (x) => isRef(x) && isStr(x.cardId, 36) && isStr(x.front, 500) && isInt(x.box, 0, 5) && isDate(x.dueAt) && isDate(x.updatedAt));
  const quizzes = list<Backup["quizzes"][number]>(o.quizzes, (x) => isRef(x) && isInt(x.total, 1, 20) && isInt(x.score, 0, x.total as number) && isDate(x.takenAt));
  if (!cases || !notes || !resources || !aiCards || !progress || !quizzes) return notBackup;
  return { caselab: BACKUP_VERSION, exportedAt: String(o.exportedAt ?? ""), cases, notes, resources, aiCards, progress, quizzes };
}

// ---------------------------------------------------------------- import

export type ImportSummary = { cases: number; notes: number; resources: number; aiCards: number; progress: number; quizzes: number; skipped: number };

const nullable = (x: unknown, max: number) => (isStr(x, max) && x.trim() ? x : null);

/** Merge a parsed backup into this user's data, all-or-nothing. */
export async function importBackup(userId: string, b: Backup): Promise<ImportSummary> {
  return withUser(userId, async (tx) => {
    const sum: ImportSummary = { cases: 0, notes: 0, resources: 0, aiCards: 0, progress: 0, quizzes: 0, skipped: 0 };
    const visible = await tx<{ id: string; code: string; name: string; owner_id: string | null }[]>`select id, code, name, owner_id from cases`;
    const byId = new Map(visible.map((c) => [c.id, c.id]));
    const byCode = new Map(visible.filter((c) => !c.owner_id).map((c) => [c.code.toUpperCase(), c.id])); // shared codes are stable
    const ownByName = new Map(visible.filter((c) => c.owner_id === userId).map((c) => [c.name.trim().toLowerCase(), c.id]));
    const caseMap = new Map<string, string>();

    // Own cases first, so everything else can point at them. Re-created if missing (new code).
    for (const c of b.cases) {
      const found = byId.get(c.caseId) ?? ownByName.get(c.name.trim().toLowerCase());
      if (found) {
        caseMap.set(c.caseId, found);
        continue;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into cases (name, owner_id, jurisdiction, focus, overview, original_verdict, latest_outcome, needs_verify)
        values (${c.name.trim()}, ${userId}, ${nullable(c.jurisdiction, 60)}, ${c.focus}, ${nullable(c.overview, 20000)},
                ${nullable(c.original_verdict, 20000)}, ${nullable(c.latest_outcome, 20000)}, true)
        returning id`;
      caseMap.set(c.caseId, row.id);
      ownByName.set(c.name.trim().toLowerCase(), row.id);
      sum.cases++;
    }
    const resolve = (r: CaseRef) => caseMap.get(r.caseId) ?? byId.get(r.caseId) ?? byCode.get(r.caseCode.toUpperCase()) ?? null;

    for (const n of b.notes) {
      const caseId = resolve(n);
      if (!caseId || !n.body) {
        sum.skipped++;
        continue;
      }
      // Restore when there is no note, it was emptied, or the backup's copy is newer.
      const r = await tx`
        insert into notes (case_id, user_id, body, updated_at) values (${caseId}, ${userId}, ${n.body}, ${new Date(n.updatedAt)})
        on conflict (case_id, user_id) do update set body = excluded.body
        where notes.body = '' or notes.updated_at < excluded.updated_at
        returning 1`;
      sum.notes += r.length;
    }

    for (const x of b.resources) {
      const caseId = resolve(x);
      if (!caseId) {
        sum.skipped++;
        continue;
      }
      const r = await tx`
        insert into resources (case_id, user_id, title, kind, url)
        select ${caseId}, ${userId}, ${x.title}, ${x.kind}, ${x.url}
        where not exists (select 1 from resources where case_id = ${caseId} and user_id = ${userId}
                          and title = ${x.title} and kind = ${x.kind} and url = ${x.url})
        returning 1`;
      sum.resources += r.length;
    }

    // AI cards: matched by front text; remember the new id so their progress can follow.
    const cardMap = new Map<string, string>();
    for (const x of b.aiCards) {
      const caseId = resolve(x);
      if (!caseId) {
        sum.skipped++;
        continue;
      }
      const [existing] = await tx<{ id: string }[]>`
        select id from flashcards where case_id = ${caseId} and user_id = ${userId} and source = 'ai' and front = ${x.front} limit 1`;
      if (existing) {
        cardMap.set(x.cardId, existing.id);
        continue;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into flashcards (case_id, user_id, front, back, source) values (${caseId}, ${userId}, ${x.front}, ${x.back}, 'ai') returning id`;
      cardMap.set(x.cardId, row.id);
      sum.aiCards++;
    }

    for (const p of b.progress) {
      const caseId = resolve(p);
      let cardId = cardMap.get(p.cardId) ?? null;
      if (!cardId && caseId) {
        // Same card id if it still exists, else the same question on that case (derived cards keep their text).
        const [row] = await tx<{ id: string }[]>`
          select id from flashcards where case_id = ${caseId} and (id::text = ${p.cardId} or front = ${p.front})
          order by (id::text = ${p.cardId}) desc limit 1`;
        cardId = row?.id ?? null;
      }
      if (!cardId) {
        sum.skipped++;
        continue;
      }
      const r = await tx`
        insert into card_progress (user_id, flashcard_id, box, due_at, updated_at)
        values (${userId}, ${cardId}, ${p.box}, ${new Date(p.dueAt)}, ${new Date(p.updatedAt)})
        on conflict (user_id, flashcard_id) do update set box = excluded.box, due_at = excluded.due_at
        where card_progress.updated_at < excluded.updated_at
        returning 1`;
      sum.progress += r.length;
    }

    for (const q of b.quizzes) {
      const caseId = resolve(q);
      if (!caseId) {
        sum.skipped++;
        continue;
      }
      const r = await tx`
        insert into quiz_results (user_id, case_id, score, total, taken_at)
        select ${userId}, ${caseId}, ${q.score}, ${q.total}, ${new Date(q.takenAt)}
        where not exists (select 1 from quiz_results where user_id = ${userId} and case_id = ${caseId}
                          and taken_at = ${new Date(q.takenAt)} and score = ${q.score} and total = ${q.total})
        returning 1`;
      sum.quizzes += r.length;
    }
    return sum;
  });
}
