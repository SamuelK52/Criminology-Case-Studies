import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURES, featuresPrompt } from "@/lib/ai/prompts";
import { barColour, caseProgress, totals, weakestThemes, type CaseProgressRow } from "@/lib/progress";

const proto = readFileSync("reference/caselab.html", "utf8");
const row = (code: string, focus: string[], o: Partial<CaseProgressRow> = {}): CaseProgressRow => ({
  code, name: `Case ${code}`, focus, cards: 4, seen: 0, known: 0, due: 4, runs: 0, score: 0, total: 0, ...o,
});

describe("FR-11 progress maths (the prototype's mastery / quizStats)", () => {
  it("card % is known/cards; with a quiz, the overall score averages both", () => {
    const p = caseProgress(row("01", ["DNA"], { seen: 4, known: 2, runs: 1, score: 1, total: 2 }));
    expect([p.cardPct, p.quizPct, p.overall, p.touched]).toEqual([50, 50, 50, true]);
    expect(caseProgress(row("02", [])).touched).toBe(false);
  });
  it("weakest theme first; untouched cases don't count; themes are capitalised", () => {
    const rows = [
      row("01", ["Forensics", "police"], { seen: 4, known: 4 }), // 100
      row("02", ["Police"], { seen: 4, known: 0 }), // 0
      row("03", ["Media"]), // untouched
    ].map(caseProgress);
    expect(weakestThemes(rows)).toEqual([
      { theme: "Police", pct: 50, cases: 2 },
      { theme: "Forensics", pct: 100, cases: 1 },
    ]);
  });
  it("totals and bar colours", () => {
    const rows = [row("01", [], { seen: 1, runs: 2, score: 3, total: 4, due: 1 }), row("02", [])].map(caseProgress);
    expect(totals(rows)).toEqual({ studied: 1, cases: 2, due: 5, runs: 2, quizPct: 75 });
    expect([barColour(70), barColour(40), barColour(39)]).toEqual(["var(--accent)", "var(--warn)", "var(--bad)"]);
  });
});

describe("FR-14 features", () => {
  it("roadmap is the prototype's FEATS, word for word", () => {
    const m = proto.match(/const FEATS=(\[\[.*?\]\]);/)!;
    expect(FEATURES).toEqual(JSON.parse(m[1]));
  });
  it("feature-ideas prompt is the prototype's, with its default audience", () => {
    const tpl = proto.match(/go\.onclick=\(\)=>ask\(`(The app is a criminology study tool[\s\S]*?)`,out,go\)/)![1];
    const proto1 = (q: string) => new Function("$", "return `" + tpl + "`;")(() => ({ value: q })) as string;
    expect(featuresPrompt("")).toBe(proto1(""));
    expect(featuresPrompt("group revision")).toBe(proto1("group revision"));
  });
});
