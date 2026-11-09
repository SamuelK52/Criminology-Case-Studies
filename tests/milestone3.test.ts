import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES } from "@/lib/ai/rules";
import { SUMMARY_MODES, caseText, summaryPrompt } from "@/lib/ai/prompts";
import { matchesCase } from "@/lib/search";

const proto = readFileSync("reference/caselab.html", "utf8");

// The 16 seed cases as the drawer sees them (name, jurisdiction, focus), parsed from the prototype.
const SEED = [...proto.matchAll(/\["(\d\d)","([^"]+)","([^"]+)","([^"]+)"/g)].map((m) => ({
  code: m[1],
  name: m[2],
  jurisdiction: m[3],
  focus: m[4].split(", "),
}));

describe("FR-02 case bank search", () => {
  it("parses all 16 seed cases", () => expect(SEED).toHaveLength(16));
  it('"confession" finds Central Park Five and Birmingham Six', () => {
    const hits = SEED.filter((c) => matchesCase(c, "confession")).map((c) => c.code);
    expect(hits).toEqual(["07", "14"]);
  });
  it("searches by jurisdiction and name, case-insensitively, all words", () => {
    expect(SEED.filter((c) => matchesCase(c, "italy")).map((c) => c.code)).toEqual(["09"]);
    expect(SEED.filter((c) => matchesCase(c, "OJ")).length).toBe(0);
    expect(SEED.filter((c) => matchesCase(c, "simpson dna")).map((c) => c.code)).toEqual(["08"]);
    expect(SEED.filter((c) => matchesCase(c, "  ")).length).toBe(16);
  });
});

describe("AI prompts", () => {
  it("RULES is the prototype's text, word for word", () => {
    const m = proto.match(/const RULES=`([^`]+)`/);
    expect(m?.[1]).toBe(RULES);
  });
  it("summary modes match the prototype's select", () => {
    for (const mode of SUMMARY_MODES) expect(proto).toContain(`<option>${mode}</option>`);
  });
  it("the summary prompt keeps the prototype's 7-part instructions and ends with the verify list", () => {
    const c = { name: "Central Park Five case", jurisdiction: "US", focus: ["False confessions"], overview: "Five teenagers.", original_verdict: "Convicted in 1990.", latest_outcome: "Vacated in 2002." };
    const p = summaryPrompt(c, "my notes", "7-part assignment structure");
    expect(p).toContain("1 Case background, 2 Investigation, 3 Criminological analysis (named theory only where it fits), 4 Court proceedings, 5 Final verdict, 6 Evaluation, 7 References to look up.");
    expect(p).toContain('End with "Verify before submitting:"');
    expect(p).toContain("Student notes:\nmy notes");
    // Accuracy NFR: original verdict and latest outcome stay separate.
    expect(caseText(c)).toContain("Original verdict: Convicted in 1990. Recorded outcome: Vacated in 2002.");
    expect(summaryPrompt(c, "", "Short revision summary")).toContain("Student notes:\n(none)");
  });
});
