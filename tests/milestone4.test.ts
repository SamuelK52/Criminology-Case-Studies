import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OFFLINE_SOURCES, sourcesPrompt } from "@/lib/ai/prompts";
import { PII_MESSAGE } from "@/lib/pii";
import { RESOURCE_KINDS, canChangeResource, checkResource, isLink, sharedLabel } from "@/lib/resources";

const proto = readFileSync("reference/caselab.html", "utf8");
const ok = { title: "Federal Court judgment, 2026", kind: "Judgment", url: "" };

describe("FR-04 resource checks (prototype messages)", () => {
  it("kinds match the prototype's select", () => {
    const opts = [...proto.match(/<select id="rK"[^>]*>(.*?)<\/select>/)![1].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
    expect([...RESOURCE_KINDS]).toEqual(opts);
  });
  it("accepts a title with a link or a citation", () => {
    expect(checkResource(ok)).toBeNull();
    expect(checkResource({ ...ok, url: "https://www.kehakiman.gov.my/" })).toBeNull();
    expect(checkResource({ ...ok, url: "[2009] 2 MLJ 1" })).toBeNull();
  });
  it("needs a title", () => expect(checkResource({ ...ok, title: "" })).toBe("Add a title — e.g. 'Federal Court judgment, 2026'."));
  it("asks for https:// on www. links", () => expect(checkResource({ ...ok, url: "www.bailii.org" })).toBe("Start links with https:// so they open."));
  it("refuses IC and bank numbers in title or link", () => {
    expect(checkResource({ ...ok, title: "IC 900101-14-5678" })).toBe(PII_MESSAGE);
    expect(checkResource({ ...ok, url: "acct 1234567890123" })).toBe(PII_MESSAGE);
  });
  it("refuses an unknown kind and over-long fields", () => {
    expect(checkResource({ ...ok, kind: "Podcast" })).toBe("Pick a resource type.");
    expect(checkResource({ ...ok, title: "x".repeat(201) })).toMatch(/200/);
  });
  it("only http(s) links are clickable", () => {
    expect(isLink("https://example.org")).toBe(true);
    expect(isLink("javascript:alert(1)")).toBe(false);
    expect(isLink("[2009] 2 MLJ 1")).toBe(false);
  });
});

describe("who can change a resource (mirrors RLS)", () => {
  const own = { user_id: "s1", shared: false, class_id: null };
  const classRes = { user_id: "l1", shared: true, class_id: "c1" };
  it("owner yes, others no, study group never", () => {
    expect(canChangeResource(own, { id: "s1", role: "student" }, [])).toBe(true);
    expect(canChangeResource(own, { id: "s2", role: "student" }, [])).toBe(false);
    expect(canChangeResource(own, { id: "l1", role: "lecturer" }, ["c1"])).toBe(false); // not students' work
    expect(canChangeResource(classRes, { id: "p1", role: "peer" }, [])).toBe(false);
  });
  it("a lecturer can change shared resources of a class they teach; the builder anything", () => {
    expect(canChangeResource(classRes, { id: "l2", role: "lecturer" }, ["c1"])).toBe(true);
    expect(canChangeResource(classRes, { id: "l2", role: "lecturer" }, ["c9"])).toBe(false);
    expect(canChangeResource(own, { id: "b", role: "builder" }, [])).toBe(true);
  });
  it("labels shared rows", () => {
    expect(sharedLabel({ shared: false, class_id: null, class_name: null })).toBeNull();
    expect(sharedLabel({ shared: true, class_id: "c1", class_name: "Crim 101" })).toBe("Shared with Crim 101");
    expect(sharedLabel({ shared: true, class_id: null, class_name: null })).toBe("Shared with everyone");
  });
});

describe("AI source suggestions", () => {
  it("uses the prototype's wording", () => {
    const c = { name: "Canny Ong murder case", jurisdiction: "Malaysia", focus: [], overview: null, original_verdict: null, latest_outcome: null };
    const tail = sourcesPrompt(c).split("\n")[1];
    expect(proto).toContain("${caseText(cur)}\\n" + tail + "`,out,go");
    expect(tail).toMatch(/Do not invent specific citations or case numbers\.$/);
  });
  it("offline text is the prototype's", () => expect(proto).toContain(OFFLINE_SOURCES));
});
