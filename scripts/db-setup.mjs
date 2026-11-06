// Applies supabase/migrations/*.sql then supabase/seed.sql to your Supabase database.
//   npm run db:setup
//   npm run db:setup -- --builder you@example.com   (also promotes that signed-up user to builder)
// Needs SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler connection string).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL. Add it to .env.local — see .env.example.");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
const dir = join(import.meta.dirname, "..", "supabase");
const files = [
  ...readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, "migrations", f)),
  join(dir, "seed.sql"),
];

try {
  for (const f of files) {
    process.stdout.write(`Applying ${f.slice(dir.length + 1)} … `);
    await sql.unsafe(readFileSync(f, "utf8"));
    console.log("ok");
  }
  const [{ n }] = await sql`select count(*)::int as n from public.cases`;
  console.log(`Case bank has ${n} cases.`);

  const i = process.argv.indexOf("--builder");
  if (i > -1) {
    const email = process.argv[i + 1];
    const r = await sql`update public.profiles p set role = 'builder', requested_role = null
                        from auth.users u where u.id = p.id and lower(u.email) = lower(${email}) returning p.id`;
    console.log(r.length ? `${email} is now the builder.` : `No signed-up user with email ${email} — sign up first.`);
  }
} catch (e) {
  console.error("\nFailed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
