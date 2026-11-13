import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { hasPII } from "@/lib/pii";
import { makeDb } from "./harness";

// Milestone 8: checks for the NFR rows that can be tested automatically.
type Db = Awaited<ReturnType<typeof makeDb>>;
let t: Db;
beforeAll(async () => {
  t = await makeDb();
}, 60_000);

describe("NFR Security", () => {
  it("RLS is on for every table in the public schema", async () => {
    const rows = await t.q<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("the app role is not a superuser, can't bypass RLS and owns no tables", async () => {
    const [r] = await t.q<{ rolsuper: boolean; rolbypassrls: boolean }>("select rolsuper, rolbypassrls from pg_roles where rolname = 'caselab_app'");
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await t.q("select 1 from pg_tables where schemaname = 'public' and tableowner = 'caselab_app'");
    expect(owned).toHaveLength(0);
  });

  const routes = readdirSync("src/app/api/ai").map((d) => [d, readFileSync(join("src/app/api/ai", d, "route.ts"), "utf8")] as const);
  it.each(routes)("AI route /api/ai/%s checks sign-in/role and takes a rate-limit token", (_name, src) => {
    expect(src).toMatch(/aiViewer\(\)/);
    expect(src).toMatch(/streamCaseAnswer|completeCaseAnswer|streamPlainAnswer/);
  });
  it("every way into Claude goes through ai_take_token", () => {
    const respond = readFileSync("src/lib/ai/respond.ts", "utf8");
    // gateCase (case tools) and streamPlainAnswer (features) are the only callers of streamText/completeAnswer.
    expect(respond.match(/ai_take_token/g)?.length).toBe(2);
    const users = [...readdirSync("src", { recursive: true, withFileTypes: true })]
      .filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
      .map((f) => join(f.parentPath, f.name))
      .filter((p) => /streamAnswer\(|completeAnswer\(/.test(readFileSync(p, "utf8")));
    expect(users.map((p) => p.replace(/\\/g, "/")).sort()).toEqual(["src/lib/ai/claude.ts", "src/lib/ai/respond.ts"]);
  });
  it("the AI clients (Claude and Gemini) are server-only, and Gemini is only reached through streamAnswer", () => {
    expect(readFileSync("src/lib/ai/claude.ts", "utf8")).toMatch(/^import "server-only";/);
    expect(readFileSync("src/lib/ai/gemini.ts", "utf8")).toMatch(/^import "server-only";/);
    const users = [...readdirSync("src", { recursive: true, withFileTypes: true })]
      .filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
      .map((f) => join(f.parentPath, f.name).replace(/\\/g, "/"))
      .filter((p) => /streamGemini\(/.test(readFileSync(p, "utf8")));
    expect(users.sort()).toEqual(["src/lib/ai/claude.ts", "src/lib/ai/gemini.ts"]);
  });
});

describe("NFR Privacy", () => {
  it("no IC or bank/card numbers in the seed data", () => {
    const seed = readFileSync("db/seed.sql", "utf8");
    const bad = seed.split("\n").filter((line) => hasPII(line));
    expect(bad).toEqual([]);
  });
});

describe("NFR Accuracy", () => {
  it("every seeded case keeps the original verdict and the latest outcome as separate fields", async () => {
    const rows = await t.q<{ code: string; latest_outcome: string | null }>("select code, latest_outcome from cases order by code");
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => r.latest_outcome)).toBe(true);
    const cols = await t.q<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'cases'");
    expect(cols.map((c) => c.column_name)).toEqual(expect.arrayContaining(["original_verdict", "latest_outcome", "needs_verify"]));
  });
  it("flagged cases exist (they show 'verify latest outcome')", async () => {
    const rows = await t.q("select 1 from cases where needs_verify");
    expect(rows.length).toBeGreaterThan(0);
  });
});
