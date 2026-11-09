import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LADDER_ROUNDS, LADDER_SIDES, caseText, counterPrompt, ladderPrompt, mootPrompt } from "@/lib/ai/prompts";

// FR-08: the Arguments prompts must be the prototype's, word for word. Each prototype template
// literal is evaluated here with the same inputs and compared with ours.
const proto = readFileSync("reference/caselab.html", "utf8");
const start = proto.indexOf('if(tab==="Arguments")');
const args = proto.slice(start, proto.indexOf("if(tab===", start + 10)); // just the Arguments handler
const templates = [...args.matchAll(/ask\(`([\s\S]*?)`,/g)].map((m) => m[1]);

const facts = { name: "O. J. Simpson case", jurisdiction: "US", focus: ["DNA evidence", "Race"], overview: "Overview.", original_verdict: null, latest_outcome: "Acquitted 1995." };

function protoPrompt(tpl: string, inputs: Record<string, string>): string {
  const $ = (sel: string) => ({ value: inputs[sel] });
  const civ = (inputs["#side"] ?? "").startsWith("Civil"); // the prototype's local variable
  return new Function("caseText", "cur", "$", "civ", "return `" + tpl + "`;")((c: typeof facts) => caseText(c), facts, $, civ) as string;
}

describe("FR-08 argument prompts match the prototype", () => {
  it("finds the three prototype templates (ladder, mock trial, counter-check)", () => expect(templates).toHaveLength(3));
  it("selects match the prototype's options", () => {
    expect(args.length).toBeGreaterThan(0);
    for (const o of [...LADDER_SIDES, ...LADDER_ROUNDS]) expect(proto).toContain(`<option>${o}</option>`);
  });
  for (const side of LADDER_SIDES) {
    for (const rounds of LADDER_ROUNDS) {
      it(`ladder: ${side}, ${rounds}`, () => {
        expect(ladderPrompt(facts, side, rounds)).toBe(protoPrompt(templates[0], { "#side": side, "#n": rounds }));
      });
    }
  }
  it("ladder labels likely arguments and asks for counter, rebuttal and reply each round", () => {
    const p = ladderPrompt(facts, "Criminal (prosecution)", "3 arguments");
    expect(p).toContain('Label anything not from the trial record "likely argument"');
    expect(p).toContain("Prosecution claim + evidence type relied on → Defence counter-argument → Rebuttal → Defence reply");
    expect(p).toContain("(criminal, beyond reasonable doubt)");
    expect(ladderPrompt(facts, "Civil (plaintiff)", "5 arguments")).toContain('Use "Plaintiff" (civil, balance of probabilities)');
  });
  it("mock-trial notes", () => expect(mootPrompt(facts)).toBe(protoPrompt(templates[1], {})));
  it("counter-check", () => {
    const point = "The confession proves guilt";
    expect(counterPrompt(facts, point)).toBe(protoPrompt(templates[2], { "#pt": point }));
  });
});
