"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { gradeCard, resetProgress } from "@/app/cases/[code]/study-actions";
import { buildQueue, knownCount, nextReview, type StudyCard } from "@/lib/study";

type Props = {
  caseId: string;
  initialCards: StudyCard[];
  signedIn: boolean; // signed-out visitors can flip cards; progress isn't saved
  canReset: boolean; // hidden from study group
  aiState: "on" | "offline" | "none"; // "none" = role without AI tools
};

/** FR-06: the prototype's flashcard deck with spaced repetition (boxes 0–5, due in 0/1/3/7/14/30 days). */
export function Flashcards({ caseId, initialCards, signedIn, canReset, aiState }: Props) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [queue, setQueue] = useState(() => buildQueue(initialCards, false));
  const [pos, setPos] = useState(0);
  const [flip, setFlip] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [seenProps, setSeenProps] = useState(initialCards);

  // New cards from the server (AI cards added, progress reset): rebuild the deck.
  if (initialCards !== seenProps) {
    setSeenProps(initialCards);
    setCards(initialCards);
    setQueue(buildQueue(initialCards, false));
    setPos(0);
    setFlip(false);
  }

  const card = queue.length ? cards[queue[pos]] : null;

  function toggle() {
    if (card) setFlip((f) => !f);
  }

  function grade(ok: boolean) {
    if (!card) return;
    const idx = queue[pos];
    const local = nextReview(card.box ?? 0, ok);
    setCards((cs) => cs.map((c, i) => (i === idx ? { ...c, box: local.box, dueAt: local.dueAt } : c)));
    // "Missed it" goes to the back of the queue, so it returns this session.
    const q = queue.filter((_, i) => i !== pos);
    if (!ok) q.push(idx);
    setQueue(q);
    setPos(pos >= q.length ? 0 : pos);
    setFlip(false);
    if (!signedIn) return;
    void gradeCard(card.id, ok).then((r) => {
      if ("error" in r) setNote(r.error);
      else setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, box: r.box, dueAt: r.dueAt } : c)));
    });
  }

  function reviewAll() {
    setQueue(buildQueue(cards, true));
    setPos(0);
    setFlip(false);
    setNote(null);
  }

  function reset() {
    setNote(null);
    startBusy(async () => {
      const r = await resetProgress(caseId);
      if (r.error) setNote(r.error);
      // The server re-renders with no progress; the deck rebuilds from the new cards.
    });
  }

  function generate() {
    if (aiState !== "on") {
      setNote("AI not available — using built-in cards");
      return;
    }
    setNote("Generating…");
    startBusy(async () => {
      try {
        const res = await fetch("/api/ai/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId }),
        });
        const j = (await res.json().catch(() => ({}))) as { added?: number; error?: string; retryAt?: string | null };
        if (!res.ok) {
          const when = j.retryAt ? ` Try again at ${new Date(j.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
          setNote(`${j.error ?? "Couldn't generate — try again."}${when}`);
          return;
        }
        setNote(`Added ${j.added} AI cards. Check them against the case file — AI can be wrong.`);
        router.refresh();
      } catch {
        setNote("Couldn't reach the server — check your connection and try again.");
      }
    });
  }

  const known = knownCount(cards);
  const nextDue = Math.min(...cards.map((c) => c.dueAt ?? Infinity));
  const status = card
    ? `${queue.length} due · box ${card.box ?? 0} · ${flip ? "how did you do?" : "tap card to flip"}`
    : `${known}/${cards.length} known`;

  if (cards.length === 0) {
    return <p className="sub">No flashcards for this case yet. Cards are built from the case record once it has an overview or outcome.</p>;
  }

  return (
    <>
      <div
        className={`card flash${flip || !card ? " back" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={card ? (flip ? "Answer — press to show the question" : "Question — press to show the answer") : undefined}
        aria-live="polite"
        onClick={toggle}
        suppressHydrationWarning // the "next due" date is formatted in the viewer's locale
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {card
          ? flip
            ? card.back
            : card.front
          : `All caught up. Next card due ${isFinite(nextDue) ? new Date(nextDue).toLocaleDateString() : "—"}.`}
      </div>
      <div className="row">
        {card && flip && (
          <>
            <button className="btn ghost" type="button" onClick={() => grade(false)}>
              Missed it
            </button>
            <button className="btn" type="button" onClick={() => grade(true)}>
              Knew it
            </button>
          </>
        )}
        <span className="sub" role="status">
          {status}
        </span>
      </div>
      <div className="row">
        <button className="btn ghost" type="button" onClick={reviewAll}>
          Review all anyway
        </button>
        {canReset && (
          <button className="btn ghost" type="button" onClick={reset} disabled={busy}>
            Reset progress
          </button>
        )}
        {aiState !== "none" && (
          <button className="btn ghost" type="button" onClick={generate} disabled={busy}>
            Generate more with AI
          </button>
        )}
      </div>
      {note && (
        <p className="sub" role="status">
          {note}
        </p>
      )}
      <p className="sub">
        Spaced repetition: &quot;Knew it&quot; moves a card up a box (due again in 1, 3, 7, 14, then 30 days). &quot;Missed it&quot; sends it back to box 0 so it
        returns this session. A card in box 3+ counts as known.
        {!signedIn && " Sign in to keep your progress."}
      </p>
    </>
  );
}
