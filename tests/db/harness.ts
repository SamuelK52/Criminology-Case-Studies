// Runs the real migrations + seed inside PGlite (PostgreSQL compiled to WASM).
// Queries made through `as()` run as the non-superuser app role `caselab_app`,
// exactly like the web app, so Row Level Security applies.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "db");

export async function makeDb() {
  const db = new PGlite();
  const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));

  /** Run fn as the app role. uid null = signed out. */
  async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
    await db.exec(`select set_config('app.user_id', '${uid ?? ""}', false); set role caselab_app;`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('app.user_id', '', false);`);
    }
  }

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;

  /** Sign up through create_user(), as the app does. */
  async function signUp(meta: { display_name: string; requested_role?: string; class_code?: string }) {
    const [r] = await as(null, () =>
      q<{ id: string }>("select create_user($1, $2, $3, $4, $5) as id", [
        `${meta.display_name.replace(/\W/g, "").toLowerCase()}@test.local`,
        "scrypt$test$hash-placeholder-0123456789",
        meta.display_name,
        meta.requested_role ?? "student",
        meta.class_code ?? null,
      ]),
    );
    return r.id;
  }

  return { db, signUp, as, q };
}
