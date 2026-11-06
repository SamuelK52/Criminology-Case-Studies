// Runs the real migrations + seed inside PGlite (Postgres compiled to WASM),
// with a minimal stand-in for Supabase's auth schema and API roles.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "supabase");

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function makeDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migrations) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));

  /** Create an auth user the way Supabase sign-up does (fires handle_new_user). */
  async function signUp(meta: Record<string, string>) {
    const r = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [`${meta.display_name}@test.local`, JSON.stringify(meta)],
    );
    return r.rows[0].id;
  }

  /** Run fn as an API role. uid null = anon. */
  async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  }

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;

  return { db, signUp, as, q };
}
