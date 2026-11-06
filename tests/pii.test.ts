import { describe, expect, it } from "vitest";
import { hasPII } from "@/lib/pii";
import { makeDb } from "./db/harness";

const SAMPLES: [string, boolean][] = [
  ["900101-14-5678", true],
  ["IC 900101145678 here", true],
  ["card 4111111111111111", true],
  ["0123456789", true],
  ["Federal Court judgment, 2026", false],
  ["Convicted in 2000; reinstated 2023", false],
  ["2025-26 records", false],
  ["12345678901234567", false], // 17 digits: not a card number
  ["", false],
];

describe("PII guard", () => {
  it.each(SAMPLES)("hasPII(%j) = %s", (text, expected) => {
    expect(hasPII(text)).toBe(expected);
  });

  it("matches the database has_pii() function", async () => {
    const { q } = await makeDb();
    for (const [text, expected] of SAMPLES) {
      const [r] = await q<{ v: boolean }>("select public.has_pii($1) v", [text]);
      expect(r.v, text).toBe(expected);
    }
  });
});
