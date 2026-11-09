import { hasPII } from "@/lib/pii";

// Flashcards (FR-06) and quiz (FR-07) logic, as in the prototype. Pure functions: used by the
// server (grading, quiz building, checking AI output) and the browser (the review queue).

export const DAY = 864e5;
/** Days until a card is due again, by box 0–5. Box 0 = "this session". */
export const GAPS = [0, 1, 3, 7, 14, 30] as const;
/** A card in box 3 or above counts as known. */
export const KNOWN_BOX = 3;

/** "Knew it" moves a card up a box (max 5); "Missed it" sends it back to box 0. */
export function nextReview(box: number, ok: boolean, now = Date.now()): { box: number; dueAt: number } {
  const b = ok ? Math.min(Math.max(box, 0) + 1, 5) : 0;
  return { box: b, dueAt: now + GAPS[b] * DAY };
}

export type StudyCard = { id: string; front: string; back: string; source: string; box: number | null; dueAt: number | null };

/** Cards to review now: unseen or due (or all, when cramming), lowest box first — the prototype's build(). */
export function buildQueue(cards: Pick<StudyCard, "box" | "dueAt">[], cram: boolean, now = Date.now()): number[] {
  return cards
    .map((_, i) => i)
    .filter((i) => cram || cards[i].dueAt == null || cards[i].dueAt! <= now)
    .sort((a, b) => (cards[a].box ?? -1) - (cards[b].box ?? -1));
}

export const knownCount = (cards: Pick<StudyCard, "box">[]) => cards.filter((c) => (c.box ?? 0) >= KNOWN_BOX).length;

// ---------------------------------------------------------------- quiz

export type QuizQuestion = { q: string; o: string[]; a: string; e: string };
type QuizCase = { name: string; jurisdiction: string | null; focus: string[]; latest_outcome: string | null };

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The prototype's seedQuiz(): outcome, focus and jurisdiction questions, with wrong options drawn
 * from other cases. Questions whose answer isn't recorded are left out.
 */
export function seedQuiz(c: QuizCase, others: QuizCase[], rand: () => number = Math.random): QuizQuestion[] {
  const pick = (k: (x: QuizCase) => string) => shuffle(others, rand).map(k).filter(Boolean).slice(0, 3);
  const focus = (x: QuizCase) => x.focus.join(", ");
  const jur = c.jurisdiction ?? "";
  const qs = [
    { q: `Which outcome matches ${c.name}?`, a: c.latest_outcome ?? "", o: [c.latest_outcome ?? "", ...pick((x) => x.latest_outcome ?? "")] },
    { q: `Which focus area best fits ${c.name}?`, a: focus(c), o: [focus(c), ...pick(focus)] },
    { q: `Which jurisdiction is ${c.name} from?`, a: jur, o: [...new Set([jur, "Malaysia", "UK", "US", "Italy"])].slice(0, 4) },
  ];
  return qs
    .filter((x) => x.a)
    .map((x) => ({ ...x, o: shuffle([...new Set(x.o)], rand), e: "From the case-bank record. Verify against court records before citing." }));
}

// ---------------------------------------------------------------- AI output

/** The JSON array in an AI answer (the model may wrap it in a sentence or a code fence). */
function jsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.length <= max ? x.trim() : null);

/** AI flashcards: a JSON array of [front, back]. Bad or PII-bearing cards are dropped; at most 12 kept. */
export function parseAiCards(text: string): [string, string][] {
  const arr = jsonArray(text) ?? [];
  const out: [string, string][] = [];
  for (const x of arr) {
    if (!Array.isArray(x)) continue;
    const front = str(x[0], 500);
    const back = str(x[1], 2000);
    if (front && back && !hasPII(front + " " + back)) out.push([front, back]);
  }
  return out.slice(0, 12);
}

/** AI quiz: a JSON array of {q, o:[4 options], a, e}; `a` must be one of the options. At most 5 kept. */
export function parseAiQuiz(text: string): QuizQuestion[] {
  const arr = jsonArray(text) ?? [];
  const out: QuizQuestion[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const q = str(r.q, 600);
    const a = str(r.a, 600);
    const e = str(r.e, 1500) ?? "Verify against court records before citing.";
    const o = Array.isArray(r.o) ? r.o.map((y) => str(y, 600)).filter((y): y is string => !!y) : [];
    const opts = [...new Set(o)];
    if (q && a && opts.length >= 2 && opts.length <= 6 && opts.includes(a) && !hasPII([q, a, e, ...opts].join(" "))) {
      out.push({ q, o: opts, a, e });
    }
  }
  return out.slice(0, 5);
}
