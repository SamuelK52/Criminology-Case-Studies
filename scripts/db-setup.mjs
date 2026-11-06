// Sets up the CaseLab database on any PostgreSQL 15+ (Railway Postgres in production).
//
//   npm run db:setup                                 apply new migrations + seed
//   npm run db:setup -- --builder you@example.com    also make that signed-up user the builder
//
// Env:
//   DATABASE_URL      owner/admin connection (Railway: ${{Postgres.DATABASE_URL}}). Used ONLY here.
//   APP_DB_PASSWORD   password for the caselab_app login role the web app uses at runtime.
//
// Safe to run on every deploy (Railway pre-deploy does): each migration file is applied once,
// recorded in public.schema_migrations; the seed only inserts what's missing.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const { DATABASE_URL, APP_DB_PASSWORD } = process.env;
if (!DATABASE_URL) fail("Missing DATABASE_URL — see .env.example.");
if (!APP_DB_PASSWORD || APP_DB_PASSWORD.length < 16) fail("Set APP_DB_PASSWORD to a random string of 16+ characters — see .env.example.");

const host = new URL(DATABASE_URL).hostname;
const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".railway.internal");
const sql = postgres(DATABASE_URL, { max: 1, ssl: local ? false : "prefer", onnotice: () => {} });
const dir = join(import.meta.dirname, "..", "db");

try {
  await sql`create table if not exists public.schema_migrations (
              name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name));

  for (const name of readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    process.stdout.write(`Applying ${name} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, "migrations", name), "utf8"));
      await tx`insert into public.schema_migrations (name) values (${name})`;
    });
    console.log("ok");
  }

  // The runtime role: can log in, is not a superuser, does not bypass RLS.
  await sql.unsafe(`alter role caselab_app with login nosuperuser nobypassrls password ${quote(APP_DB_PASSWORD)}`);
  const [{ current_database: dbname }] = await sql`select current_database()`;
  await sql.unsafe(`grant connect on database ${ident(dbname)} to caselab_app`);

  process.stdout.write("Applying seed.sql … ");
  await sql.unsafe(readFileSync(join(dir, "seed.sql"), "utf8"));
  console.log("ok");

  const [{ n }] = await sql`select count(*)::int as n from public.cases where owner_id is null`;
  console.log(`Case bank has ${n} shared cases.`);

  const i = process.argv.indexOf("--builder");
  if (i > -1) {
    const email = process.argv[i + 1];
    const r = await sql`update public.profiles p set role = 'builder', requested_role = null
                        from public.users u where u.id = p.id and lower(u.email) = lower(${email}) returning p.id`;
    console.log(r.length ? `${email} is now the builder.` : `No signed-up user with email ${email} — sign up first.`);
  }
} catch (e) {
  console.error("\nDatabase setup failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
function quote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function ident(s) {
  return '"' + String(s).replace(/"/g, '""') + '"';
}
