# CaseLab Criminology — build plan (awaiting approval)

Source of truth: `caselab_1.html` (to be copied to `reference/caselab.html`) and `CaseLab-ClaudeCode-Prompt_1.md`.

## 0. Prerequisites (blocking)

| Item | Status | Who |
|---|---|---|
| Node.js 20 LTS | **Not installed** | I can install with `winget` once you say yes |
| Git | **Not installed** | Same |
| Supabase project (free tier) → URL, anon key, service-role key | Needed by Milestone 1 | You create it at supabase.com and paste keys into `.env.local` yourself |
| Anthropic API key | Needed by Milestone 3 | You paste it into `.env.local` yourself |
| Vercel account | Needed by Milestone 8 | You |

**Project location:** this folder is inside OneDrive. OneDrive syncing `node_modules` (≈40k files) is slow and often causes `EPERM` lock errors during `npm install`. Recommendation: build in `C:\Users\Samuel\dev\caselab` (outside OneDrive) and push to GitHub for backup. Alternative: build here anyway.

## 1. Folder structure

```
caselab/
  reference/caselab.html          copy of the prototype (never edited)
  supabase/
    migrations/0001_schema.sql    tables, indexes, triggers
    migrations/0002_rls.sql       helper functions + RLS policies
    seed.sql                      16 cases + 7 EXTRA cards for case 16
  src/
    app/
      (auth)/login/page.tsx       "Open the Case Files" — sign in / sign up, roles as folder tabs
      auth/callback/route.ts
      (app)/layout.tsx            header, wordmark, who-chip, case-bank drawer
      (app)/cases/[code]/[tab]/page.tsx   summary | resources | flashcards | quiz | arguments
      (app)/progress/page.tsx
      (app)/features/page.tsx
      (app)/classes/page.tsx      lecturer: create class + join code
      (app)/admin/page.tsx        builder: change user roles
      api/ai/[task]/route.ts      summary, sources, ladder, moot, counter, cards, quiz, features
      api/export/route.ts         GET → JSON of my data
      api/import/route.ts         POST ← JSON
    components/                   CaseDrawer, FolderTabs, Dossier, Sheet, Flashcard, Quiz, …
    lib/
      supabase/{client,server,middleware}.ts
      ai/rules.ts                 RULES system prompt, word for word
      ai/prompts.ts               prompt builders copied from the prototype's ask()/sample.json()
      srs.ts                      boxes 0–5, gaps 0/1/3/7/14/30 days
      pii.ts                      IC / bank-number guard (shared client + server)
      progress.ts                 mastery, quiz stats, weakest themes
      permissions.ts              role → allowed tools (UI only; DB enforces via RLS)
    middleware.ts                 refresh session, redirect signed-out users to /login
  tests/                          Vitest: srs, pii, progress, prompt builders
  .env.example  README.md  DECISIONS.md
```

## 2. Database

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | id (= auth uid), display_name, role, requested_role, class_id | created by trigger on sign-up |
| `classes` | id, name, join_code (unique), lecturer_id | |
| `cases` | id uuid, code (`01`…`16`, `U…`), name, jurisdiction, focus text[], overview, original_verdict, latest_outcome, needs_verify, owner_id (null = shared bank), class_id, updated_by, updated_at | unique lower(name) per scope |
| `notes` | id, case_id, user_id, body, updated_at | unique (case_id, user_id) — autosave upsert |
| `resources` | id, case_id, user_id, class_id, shared bool, title, kind, url, created_at | lecturers can add shared class resources |
| `flashcards` | id, case_id, user_id (null = shared), front, back, source (`derived` / `seed` / `ai`), slot | |
| `card_progress` | user_id, flashcard_id, box, due_at | PK (user_id, flashcard_id) |
| `quiz_results` | id, user_id, case_id, score, total, taken_at | |
| `ai_usage` | id, user_id, task, created_at | rate limit: 20 per user per hour |

- The prototype's 4 auto-made cards per case (`seedCards`) become `derived` shared rows, rebuilt by a trigger whenever a case changes. A lecturer's correction then shows up in the cards, and students keep their progress.
- The seed quiz (`seedQuiz`) is built at runtime from the case bank, as in the prototype. Nothing is stored for it.
- The seed's single outcome text goes into `latest_outcome`. `original_verdict` starts empty and lecturers can fill it in. The UI always shows the two separately ("Original verdict: not recorded — verify").

## 3. Permissions (RLS on every table)

Helper functions `my_role()` and `my_class()` are `security definer`, so policies never recurse on `profiles`.

| | Student | Lecturer | Study group | Builder |
|---|---|---|---|---|
| Read shared bank + class cases | ✓ | ✓ | ✓ | ✓ |
| Own cases (add/edit/delete) | ✓ own | ✓ own + class | ✗ | ✓ all |
| Edit shared-bank cases (FR-13) | ✗ | ✓ | ✗ | ✓ |
| Notes / resources | ✓ own CRUD | ✓ own + shared class resources, no deleting students' rows | read shared only | ✓ |
| card_progress, quiz_results | ✓ own | ✓ own | ✓ own (they flip cards and take quizzes) | ✓ |
| AI routes | ✓ | ✓ | ✗ (blocked server-side too) | ✓ |
| Export / import | ✓ own | ✗ | ✗ | ✓ |
| Change roles | ✗ | ✗ | ✗ | ✓ (admin page) |

- **No self-promotion:** sign-up offers Student, Study group and Lecturer. Picking Lecturer creates a *student* account with `requested_role = lecturer`, which the builder approves on `/admin`. Builder is never self-assignable; the first builder is set with one SQL line in the README. The `role` column cannot be updated by its owner (column privilege + trigger).
- Class code at sign-up is checked against `classes.join_code`. An unknown code shows a clear error.

## 4. AI

- Route `/api/ai/[task]` accepts only `{ caseId, inputs }`. Prompts are built **on the server** from `lib/ai/prompts.ts`, so the browser can't send arbitrary prompts. `RULES` is sent as the system prompt, word for word.
- Model `claude-sonnet-5-5` (current Sonnet), overridable with `ANTHROPIC_MODEL`.
- Text tasks stream to the browser. `cards` and `quiz` return validated JSON (zod); bad JSON falls back to the built-in content.
- Rate limit: Postgres function `ai_take_token()` checks the count and inserts in one step. Over the limit, it returns 429 with "20 AI requests per hour — try again at 14:05".
- If the AI is down or the key is missing, the case bank, built-in flashcards and seed quiz keep working. The header shows "AI: offline — built-in study mode", as in the prototype.

## 5. Design

Tailwind with the prototype's tokens as CSS variables (`--desk`, `--paper`, `--cobalt`…) and `next/font` for Anton, Libre Caslon Text and IBM Plex Mono. The prototype's CSS for the folder, sheet, clip, chip, button, flash and opt styles is ported mostly as-is into `globals.css` component classes, because those effects are layered backgrounds that utilities express badly. Layout and spacing use Tailwind. Scrolling containers are never rotated. The layout is one column under 860px.

## 6. Build order (milestones from the brief; I stop and wait for "next" after each)

1. **Setup:** Next.js + TS + Tailwind tokens/fonts, schema, RLS, seed, git init. *Test:* the case list loads from Supabase.
2. **Auth & roles:** sign up/in/out, class code, role UI, `/admin`, `/classes`. *Test:* FR-01, FR-09.
3. **Case bank & summary:** search, add own case, PII/duplicate checks, dossier, notes autosave, streaming summary. *Test:* FR-02, FR-03, FR-10.
4. **Resources:** CRUD + AI source suggestions. *Test:* FR-04.
5. **Flashcards & quiz:** SRS, AI cards, quiz with saved scores. *Test:* FR-06, FR-07.
6. **Arguments:** ladder, mock-trial notes, counter-check. *Test:* FR-08.
7. **Progress, export, features:** weakest themes, per-case table, JSON export/import, roadmap. *Test:* FR-11, FR-12, FR-14; FR-13 lecturer case editing.
8. **Polish & deploy:** 400px check, contrast, error states, Vercel deploy, final FR check-off table. *Test:* every NFR row.

Each milestone ends with a git commit and a "how to test" list.
