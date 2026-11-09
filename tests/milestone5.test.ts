import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flashcardsPrompt, quizPrompt } from "@/lib/ai/prompts";
import { DAY, GAPS, buildQueue, knownCount, nextReview, parseAiCards, parseAiQuiz, seedQuiz } from "@/lib/study";

const proto = readFileSync("reference/caselab.html", "utf8");
const facts = { name: "Canny Ong murder case", jurisdiction: "Malaysia", focus: ["Forensics"], overview: null, original_verdict: null, latest_outcome: null };

describe("FR-06 spaced repetition", () => {
  it("gaps are the prototype's 0/1/3/7/14/30 days", () => {
    expect(proto).toContain(`GAPS=[${GAPS.join(",")}]`);
  });
  it("Knew it moves up a box (max 5); Missed it goes back to box 0, due now", () => {
    const now = 1_000_000;
    expect(nextReview(0, true, now)).toEqual({ box: 1, dueAt: now + DAY });
    expect(nextReview(2, true, now)).toEqual({ box: 3, dueAt: now + 7 * DAY });
    expect(nextReview(5, true, now)).toEqual({ box: 5, dueAt: now + 30 * DAY });
    expect(nextReview(4, false, now)).toEqual({ box: 0, dueAt: now });
  });
  it("queue: unseen and due cards, lowest box first; cram includes everything", () => {
    const now = 10 * DAY;
    const cards = [
      { box: 2, dueAt: now - 1 }, // due
      { box: null, dueAt: null }, // unseen
      { box: 4, dueAt: now + DAY }, // not due
      { box: 0, dueAt: now }, // due (missed)
    ];
    expect(buildQueue(cards, false, now)).toEqual([1, 3, 0]);
    expect(buildQueue(cards, true, now)).toEqual([1, 3, 0, 2]);
  });
  it("a missed card returns in the same session", () => {
    // Grade the first card "Missed it": it goes to the back of the queue and is due now.
    const now = 5 * DAY;
    const cards = [{ box: null, dueAt: null }, { box: null, dueAt: null }];
    let queue = buildQueue(cards, false, now);
    const missed = queue[0];
    const r = nextReview(0, false, now);
    queue = [...queue.slice(1), missed];
    expect(queue).toEqual([1, 0]);
    expect(r.dueAt <= now).toBe(true);
  });
  it("box 3+ counts as known", () => expect(knownCount([{ box: 3 }, { box: 2 }, { box: 5 }, { box: null }])).toBe(2));
});

describe("FR-07 built-in quiz (the prototype's seedQuiz)", () => {
  const c = { name: "Case A", jurisdiction: "UK", focus: ["Racism", "Police"], latest_outcome: "Convicted 2012" };
  const others = [
    { name: "B", jurisdiction: "US", focus: ["DNA"], latest_outcome: "Acquitted" },
    { name: "C", jurisdiction: "Italy", focus: ["Media"], latest_outcome: "Quashed" },
    { name: "D", jurisdiction: "Malaysia", focus: ["Forensics"], latest_outcome: "Death sentence" },
    { name: "E", jurisdiction: "UK", focus: ["Confession"], latest_outcome: "Released" },
  ];
  it("asks outcome, focus and jurisdiction, each with the right answer among the options", () => {
    const q = seedQuiz(c, others, () => 0.3);
    expect(q.map((x) => x.q)).toEqual(["Which outcome matches Case A?", "Which focus area best fits Case A?", "Which jurisdiction is Case A from?"]);
    for (const x of q) {
      expect(x.o).toContain(x.a);
      expect(x.o.length).toBeLessThanOrEqual(4);
      expect(new Set(x.o).size).toBe(x.o.length);
      expect(x.e).toBe("From the case-bank record. Verify against court records before citing.");
    }
    expect(q[1].a).toBe("Racism, Police");
  });
  it("drops questions with no recorded answer (a new own case)", () => {
    expect(seedQuiz({ name: "Mine", jurisdiction: null, focus: [], latest_outcome: null }, others)).toEqual([]);
  });
  it("explanation text is the prototype's", () => expect(proto).toContain("From the case-bank record. Verify against court records before citing."));
});

describe("AI flashcards and quiz", () => {
  it("prompts use the prototype's wording", () => {
    expect(proto).toContain(flashcardsPrompt(facts).split("\n")[1]);
    expect(proto).toContain(quizPrompt(facts).split("\n")[1]);
  });
  it("parses cards from a wrapped answer and drops bad ones", () => {
    const text = 'Here you go:\n```json\n[["Q1","A1"],["Q2"],[1,2],["IC?","900101-14-5678"],["Q3","A3"]]\n```';
    expect(parseAiCards(text)).toEqual([["Q1", "A1"], ["Q3", "A3"]]);
    expect(parseAiCards("no json here")).toEqual([]);
  });
  it("keeps quiz questions only when the answer is one of the options", () => {
    const text = JSON.stringify([
      { q: "Who?", o: ["A", "B", "C", "D"], a: "B", e: "Because." },
      { q: "Bad", o: ["A", "B"], a: "Z", e: "x" },
      { q: "No expl", o: ["X", "Y", "Y"], a: "X" },
    ]);
    expect(parseAiQuiz(text)).toEqual([
      { q: "Who?", o: ["A", "B", "C", "D"], a: "B", e: "Because." },
      { q: "No expl", o: ["X", "Y"], a: "X", e: "Verify against court records before citing." },
    ]);
  });
});
