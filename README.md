# CaseLab Criminology

A study app for criminology students: a bank of real criminal cases with AI summaries, study resources, spaced-repetition flashcards, quizzes, prosecution-vs-defence argument ladders and progress tracking.

- Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, **PostgreSQL** with Row Level Security (Railway Postgres), Anthropic API, Railway (hosting).
- The original single-file prototype is in `reference/caselab.html`. It is the source of truth for content, wording and style.
- The brief is in `docs/BRIEF.md`, the plan in `docs/PLAN.md`, and judgement calls in `DECISIONS.md`. Where they differ, DECISIONS wins: the project uses plain Postgres, not Supabase.

## Status

| Milestone | State |
|---|---|
| 1. Setup: tokens, fonts, schema, RLS, seed | ✅ done |
| 2. Auth & roles: sign-up/in/out, class codes, role-based UI, `/classes`, `/admin` | ✅ done |
| 3. Case bank & summary: search, add own case, dossier, notes autosave, streamed AI summary | ✅ done |
| 4. Resources: add/edit/remove per case, class sharing for lecturers, AI source suggestions | ✅ done |
| 5. Flashcards & quiz: spaced repetition, AI cards, built-in and AI quizzes with saved scores | ✅ done |
| 6. Arguments | next |
| 7–8 | to do |

## AI

- `/api/ai/summary`, `/api/ai/sources`, `/api/ai/flashcards` and `/api/ai/quiz` build the prompt **on the server** from the case record and the student's notes. The browser never sends a prompt. The `RULES` system prompt (`src/lib/ai/rules.ts`) is the prototype's text word for word, and a test checks it.
- The model is `claude-sonnet-5-5` unless `ANTHROPIC_MODEL` is set. Answers stream as they are written. If Claude declines a request, it is retried on another model server-side (`fallbacks: "default"`).
- Limit: 20 AI requests per user per rolling hour, enforced in Postgres (`ai_take_token`). Study-group accounts have no AI.
- If `ANTHROPIC_API_KEY` is missing, or the AI service fails, the header shows **"AI: offline — built-in study mode"**. The case bank, notes and resources keep working, and the Resources tab shows the prototype's built-in source starting points instead of AI suggestions.

## Resources (FR-04)

- Each case has a **Resources** tab (`/cases/<code>/resources`): title, type (Judgment, Article, Lecture, Book, Video, Note) and a link or citation. Add, edit and remove; everything is stored in Postgres, so it shows on any device.
- Only `http(s)://` links are clickable; anything else is shown as a citation.
- Lecturers can share a resource with a class they teach ("Who can see it"); members of that class, including study-group accounts, see it read-only. The builder can share with everyone. Lecturers can never change or remove students' resources (RLS).

## Flashcards and quiz (FR-06, FR-07)

- **Flashcards** (`/cases/<code>/flashcards`): case 16's seven hand-written cards, four cards built from each case record (kept in step by a database trigger), and your own AI cards. "Knew it" moves a card up a box (due again in 1, 3, 7, 14, then 30 days); "Missed it" sends it to box 0 and back into this session's queue. Box 3+ counts as known. The new box is worked out on the server from the stored one.
- Anyone can flip cards; progress is saved for signed-in users, study group included. "Reset progress" and "Generate more with AI" are hidden from study group. New AI cards replace your earlier AI cards for that case, as in the prototype.
- **Quiz** (`/cases/<code>/quiz`): the prototype's built-in quiz from the case record (outcome, themes, jurisdiction; wrong options from other cases), or a fresh 5-question AI quiz. Pick an answer to see the right one and the explanation; the score is saved when every question is answered. Recent scores are listed under the quiz; the Progress tab (Milestone 7) will total them.
- With AI off, flashcards and the built-in quiz still work.

## Accounts and roles

- **Sign up** at `/login` → *Create account*. Choose Student, Study group or Lecturer, and optionally enter a class code.
  - Lecturer is a *request*: the account works as a Student until the builder approves it on `/admin`.
  - Builder can't be chosen at sign-up.
- **Passwords** are hashed with scrypt. After 10 wrong passwords for one email in 15 minutes, sign-in for that email pauses for 15 minutes.
- **Sessions** last 30 days, in an httpOnly cookie. **Sign out** deletes the session in the database too.
- **`/classes`:** lecturers (and the builder) create classes with a join code like `CRIM101-2026`. Students and study-group members join or leave with the code.
- **`/admin`:** builder only. Lists every account with its email, approves lecturer requests and changes roles. The last builder can't demote themselves.

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

### 4. Make yourself the builder (once you have signed up)

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
| `DB_POOL_MAX` | optional pool size, default 10. Use `1` with a local PGlite server | no |
| `ANTHROPIC_API_KEY` | `/api/ai/*` only (server). Without it, AI shows as offline | **yes** |
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
.railway/railway.ts           Railway build / pre-deploy / start (IaC)
```

## Deploy: Railway

**Live:** https://web-production-8e46.up.railway.app

Project: **caselab** in "Goon Monster's Projects". It has two services, `Postgres` and `web`. The folder is linked with `npx @railway/cli link`. The deploy config lives in `.railway/railway.ts` (Railway Infrastructure-as-Code). Variables are *unmanaged*, so they're set only in the Railway dashboard, never in the repo.

The setup is already done. To recreate it in a new project:

1. **Database:** **+ New → Database → PostgreSQL**. Skip this if you already added one in setup step 2.
2. **App:** **+ New → GitHub Repository → SamuelK52/Criminology-Case-Studies**, branch `main`. Pushes are deployed by GitHub Actions (below), not by Railway's GitHub app.
3. **App variables** (the app service → **Variables**):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`. This is a reference variable over Railway's private network.
   - `APP_DB_PASSWORD` = the same random string as in `.env.local`, or a new one; the pre-deploy step applies it.
   - `ANTHROPIC_API_KEY`: your key from console.anthropic.com. Set it here only, never in the repo.
4. **Domain:** go to the app service → **Settings → Networking → Generate Domain**.

`.railway/railway.ts` runs `npm run db:setup` as the **pre-deploy** step, so new migrations apply automatically before each release. The app then starts with `npm run start` and is health-checked on `/`.

### Automatic deploys: GitHub Actions

`.github/workflows/deploy.yml` runs on every push and pull request:

1. **test:** typecheck, lint, and the tests.
2. **deploy** (pushes to `main` only, after the tests pass):
   - asks Railway to deploy exactly the pushed commit (`railway redeploy --commit <sha>`);
   - waits until Railway reports `SUCCESS` (and fails the run if the deploy fails);
   - checks the live site shows the case bank.

   Deploys run one at a time.

It needs one secret. **Create it once:**

1. Railway → avatar → **Account Settings → Tokens** (https://railway.com/account/tokens). Name it `github-actions`, choose the workspace **Goon Monster's Projects**, and click **Create**. Copy the token; Railway shows it only once.
2. GitHub → **SamuelK52/Criminology-Case-Studies → Settings → Secrets and variables → Actions → New repository secret**. Name it `RAILWAY_API_TOKEN` and paste the token as the value.

This is a **workspace token**, so it can reach every project in "Goon Monster's Projects", not just caselab. Keep it only in the GitHub secret. To revoke it, delete it in Railway; to replace it, create a new one and update the secret. You can also run the workflow by hand from the **Actions** tab ("Run workflow").

**Changing deploy settings:** edit `.railway/railway.ts`, then preview and apply. Railway doesn't read the file on push; `config apply` is what changes the service.

```bash
npx @railway/cli config plan
```

```bash
npx @railway/cli config apply --yes
```

On Windows, the `railway` SDK checks the CLI version by running a bare `railway --version`, which can't find npm's `railway.cmd` shim. Put the folder containing the real `railway.exe` (inside `@railway/cli/bin`) first on `PATH` before running `plan` or `apply`.

**Backups:** turn on Railway's Postgres backups (Postgres service → **Backups**) to meet the daily-backup requirement. Students can also export and import their own data as JSON (Milestone 7).
