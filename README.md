# CaseLab Criminology

A study app for criminology students: a bank of real criminal cases with AI summaries, study resources, spaced-repetition flashcards, quizzes, prosecution-vs-defence argument ladders and progress tracking.

- Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, **PostgreSQL** with Row Level Security (Railway Postgres), Anthropic API, Railway (hosting).
- The original single-file prototype is in `reference/caselab.html`. It is the source of truth for content, wording and style.
- The brief is in `docs/BRIEF.md`, the plan in `docs/PLAN.md`, and judgement calls in `DECISIONS.md`. Where they differ, DECISIONS wins: the project uses plain Postgres, not Supabase.

## Status

| Milestone | State |
|---|---|
| 1. Setup: tokens, fonts, schema, RLS, seed | ✅ done |
| 2. Auth & roles | next |
| 3–8 | to do |

## How the database is protected

- **Two database roles.** Migrations run as the database owner (`DATABASE_URL`). The web app logs in as `caselab_app`, which is not a superuser and doesn't own the tables, so **Row Level Security applies to every query it makes**.
- **Who is asking.** Each request runs in one transaction that starts with `set_config('app.user_id', <id>, true)`. Every policy reads that value through `current_user_id()`. The setting lasts only for that transaction, so it can't leak to another request on a pooled connection.
- **Credentials.** `users` and `sessions` can't be read by the app role at all. Sign-up, login and session lookup go through a few `security definer` functions. Passwords are hashed with scrypt in the app, and session cookies are stored only as SHA-256 hashes.

## Setup

### 1. Install

Needs Node.js 20+ (built on 26) and Git.

```bash
npm install
```

### 2. Get a Postgres database

**Railway (recommended):** in the `caselab` project, click **+ New → Database → PostgreSQL**. Open the Postgres service, then **Variables**, and copy `DATABASE_PUBLIC_URL`.

Any PostgreSQL 15+ also works: local, Neon, and so on.

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL`: the URL you copied (owner connection, used only for migrations).
- `APP_DB_PASSWORD`: any random string of 16+ characters. You can generate one with:
  ```bash
  node -e "console.log(crypto.randomBytes(24).toString('base64url'))"
  ```

### 3. Create tables, the app role, and seed the 16 cases

```bash
npm run db:setup
```

This applies each file in `db/migrations/` once (recorded in `schema_migrations`), gives `caselab_app` its login password and loads `db/seed.sql`. It's safe to run again; Railway runs it before every deploy.

### 4. Make yourself the builder (after Milestone 2, once you have signed up)

```bash
npm run db:setup -- --builder you@example.com
```

Nobody can choose Builder at sign-up. Lecturer sign-ups wait for the builder to approve them.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Used by | Secret? |
|---|---|---|
| `DATABASE_URL` | `npm run db:setup` (owner connection). The app only takes host/port/database from it, never the owner login | **yes** |
| `APP_DB_PASSWORD` | the app's `caselab_app` login, and set by `db:setup` | **yes** |
| `APP_DATABASE_URL` | optional full runtime URL; overrides the two above | **yes** |
| `ANTHROPIC_API_KEY` | server routes only (Milestone 3+) | **yes** |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-5-5` | no |

Nothing is exposed to the browser: there are no `NEXT_PUBLIC_*` variables. `.env.local` is git-ignored.

## Tests

```bash
npm test
```

The tests run the real migrations and seed inside [PGlite](https://pglite.dev), which is PostgreSQL compiled to WebAssembly, so no Docker or database server is needed. Queries run as `caselab_app`, just as the app does. They check:

- the role matrix for every role: private notes, study-group read-only access, no self-promotion, lecturer case corrections (FR-13), class visibility;
- credentials: the app role can't read users or sessions, sessions expire, emails are unique;
- the AI rate limit (20/hour);
- the PDPA guard (the UI and the database agree);
- that migrations and the seed can be re-run.

Other checks: `npm run typecheck`, `npm run lint`, `npm run build` (the build never connects to the database).

## Project layout

```
reference/caselab.html        prototype (never edited)
db/migrations/                schema + RLS, applied in order, once each
db/seed.sql                   16 cases + case 16 extra flashcards
scripts/db-setup.mjs          migrations + app role + seed (+ --builder)
src/app/                      routes
src/components/               UI pieces (Dossier, Wordmark, …)
src/lib/db.ts                 Postgres pool as caselab_app + withUser()
src/lib/                      PII guard, case loading, types
tests/                        Vitest + PGlite
railway.json                  Railway build / pre-deploy / start
```

## Deploy: Railway

Project: **caselab** in "Goon Monster's Projects". The folder is already linked with `npx @railway/cli link`.

1. **Database:** **+ New → Database → PostgreSQL**. Skip this if you already added one in setup step 2.
2. **App:** **+ New → GitHub Repository → SamuelK52/Criminology-Case-Studies**, branch `main`. Every push to `main` then deploys.
3. **App variables** (the app service → **Variables**):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`. This is a reference variable over Railway's private network.
   - `APP_DB_PASSWORD` = the same random string as in `.env.local`, or a new one; the pre-deploy step applies it.
   - `ANTHROPIC_API_KEY`, from Milestone 3.
4. **Domain:** go to the app service → **Settings → Networking → Generate Domain**.

`railway.json` runs `npm run db:setup` as the **pre-deploy** step, so new migrations apply automatically before each release. The app then starts with `npm run start` and is health-checked on `/`.

**Backups:** turn on Railway's Postgres backups (Postgres service → **Backups**) to meet the daily-backup requirement. Students can also export and import their own data as JSON (Milestone 7).
