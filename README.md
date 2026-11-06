# CaseLab Criminology

A study app for criminology students: a bank of real criminal cases with AI summaries, study resources, spaced-repetition flashcards, quizzes, prosecution-vs-defence argument ladders and progress tracking.

- Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase (Postgres + Auth + RLS), Anthropic API, Railway (hosting).
- The original single-file prototype is in `reference/caselab.html`. It is the source of truth for content, wording and style.
- The brief is in `docs/BRIEF.md`, the plan in `docs/PLAN.md`, and judgement calls in `DECISIONS.md`.

## Status

| Milestone | State |
|---|---|
| 1. Setup: tokens, fonts, schema, RLS, seed | ✅ done |
| 2. Auth & roles | next |
| 3–8 | to do |

## Setup

### 1. Install

Needs Node.js 20+ (built on 26) and Git.

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project. Note the database password.
2. Copy `.env.example` to `.env.local`.
3. Fill in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: from **Project Settings → API Keys**. The legacy `anon` key also works.
   - `SUPABASE_DB_URL`: from **Connect → Session pooler**. Replace `[YOUR-PASSWORD]` with your database password.

### 3. Create tables and seed the 16 cases

```bash
npm run db:setup
```

This applies `supabase/migrations/*.sql` (schema, RLS policies) and then `supabase/seed.sql`. It is safe to run again. If you prefer, you can paste the three files, in that order, into the Supabase SQL Editor instead.

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

| Variable | Where it's used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server (RLS protects the data) | no |
| `SUPABASE_DB_URL` | `npm run db:setup` on your machine only. Don't add it to Railway | **yes** |
| `ANTHROPIC_API_KEY` | server routes only (Milestone 3+) | **yes** |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-5-5` | no |

`.env.local` is git-ignored. Never commit real keys.

## Tests

```bash
npm test
```

The tests run the real migrations and seed inside [PGlite](https://pglite.dev), which is Postgres compiled to WebAssembly, so no Docker or Supabase project is needed. A small stand-in provides Supabase's `auth` schema. They check the role matrix as each role: students' private notes, study-group read-only access, no self-promotion, lecturer case corrections (FR-13), class visibility, the AI rate limit (20/hour) and the PDPA guard.

Other checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Project layout

```
reference/caselab.html        prototype (never edited)
supabase/migrations/          schema + RLS (run in order)
supabase/seed.sql             16 cases + case 16 extra flashcards
scripts/db-setup.mjs          applies migrations + seed
src/app/                      routes
src/components/               UI pieces (Dossier, Wordmark, …)
src/lib/                      supabase clients, PII guard, types
src/proxy.ts                  refreshes the Supabase session (Next 16's "middleware")
tests/                        Vitest + PGlite
```

## Deploy: Railway

The app is deployed on [Railway](https://railway.com). `railway.json` sets the build (`npm run build`), the start command (`npm run start`, which listens on Railway's `$PORT`) and a health check on `/`.

1. Link once from the project folder: `npx @railway/cli login`, then `npx @railway/cli link` (or `init` for a new project).
2. In the Railway service, open **Variables** and add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` and, optionally, `ANTHROPIC_MODEL`.
   - `NEXT_PUBLIC_*` values are built into the browser bundle, so after changing them, **redeploy** (not just restart).
   - Don't add `SUPABASE_DB_URL`. It is only for `npm run db:setup` on your machine.
3. Connect the service to the GitHub repo (**Settings → Source**) so every push to `main` deploys. Or deploy by hand with `npx @railway/cli up`.
4. In Supabase **Authentication → URL Configuration**, add the Railway domain (`https://<service>.up.railway.app`) as the Site URL / redirect URL. This matters from Milestone 2 on.
