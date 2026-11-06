# Claude Code prompt: CaseLab Criminology

Copy everything below the line into Claude Code. Open it in an empty project folder, and put `caselab.html` (the current prototype) in that folder as `reference/caselab.html`.

---

## ROLE
You are a senior full-stack developer building a production version of **CaseLab Criminology**, a study app for criminology students. A working single-file prototype is at `reference/caselab.html`. Treat it as the source of truth for features, content, wording and visual style. Read all of it before you plan.

## WORKING RULES
1. **Plan first.** Before writing code, give me a short plan: folder structure, database tables, pages and routes, and build order. Wait for my approval.
2. Build in the milestones below. Stop after each one, tell me how to test it, and wait for me to say "next".
3. Work on copies and use git. Commit after each milestone with a clear message.
4. Never hard-code secrets. Use `.env.local`, and provide a `.env.example`.
5. If something is unclear, make the simplest reasonable choice, write it in `DECISIONS.md`, and keep going.

## TECH STACK
- Next.js 14+ (App Router) with TypeScript
- Tailwind CSS, using the design tokens below as CSS variables
- Supabase for Postgres, Auth (email + password) and Row Level Security
- Anthropic API for AI features. Call it only from server routes, never from the browser. Model: `claude-sonnet-4-5`, or whatever the current Sonnet model is.
- Deploy target: Vercel

## WHAT THE APP DOES
A criminology student can:
- browse a bank of real case studies
- summarise their notes into an assignment structure
- organise study resources per case
- revise with spaced-repetition flashcards and quizzes
- practise prosecution vs defence arguments with counter-arguments and rebuttals
- track progress by case and by theme

## STAKEHOLDERS (workbook step 1.2)
| Type | Who | What they need most |
|---|---|---|
| Primary user | Criminology student | Fast revision: summaries, flashcards, quizzes, argument practice |
| Secondary user | Study-group classmate | Read case files and test themselves before exams |
| Decision-maker | Course lecturer | Accurate case facts, outcomes kept current, no invented sources |
| Builder | Developer + Claude Code | Clear requirements, backups, a checklist to test against |

## ROLES AND PERMISSIONS
Enforce these in the database with Supabase RLS policies, not only in the UI.

| Role | View | Add | Edit | Delete | AI tools | Backup/export | Manage cases & users |
|---|---|---|---|---|---|---|---|
| Student | ✓ | ✓ own | ✓ own | ✓ own | ✓ | ✓ own | ✗ |
| Lecturer | ✓ | ✓ | ✓ cases & resources | ✗ students' work | ✓ | ✗ | ✓ cases in their class |
| Study group | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Builder (admin) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

- **Student:** full control of their own notes, resources, flashcard progress, quiz scores and exports.
- **Lecturer:** creates and corrects cases and shared resources for a class and uses AI to prepare material. Cannot delete students' work.
- **Study group:** reads case files, flips flashcards, takes quizzes and sees their own progress. All other controls are hidden.
- **Builder:** everything, including a simple admin page to change user roles.

Classes: a lecturer creates a class with a join code, for example `CRIM101-2026`. Students and study-group members enter the code at sign-up to join it.

## FUNCTIONAL REQUIREMENTS (workbook step 1.4)
| ID | The app shall… | Priority | How I'll test it |
|---|---|---|---|
| FR-01 | let me sign up and sign in with email and password, pick a role and an optional class code, and sign out | Must | Sign up as Student, sign out, sign in again |
| FR-02 | show a case bank, searchable by name, theme or jurisdiction, and let me add my own case | Must | Search "confession" → Central Park Five and Birmingham Six appear |
| FR-03 | summarise pasted notes into the 7-part assignment structure, ending with a "Verify before submitting" list | Must | Paste notes on case 07, click Summarise, 7 headings appear |
| FR-04 | let me add, edit and remove study resources per case (title, type, link or citation) | Must | Edit a resource title and it updates |
| FR-05 | keep all my data in the database so it is there on any device | Must | Add a resource on laptop, see it on phone |
| FR-06 | show flashcards with spaced repetition (boxes 0–5, due again in 0/1/3/7/14/30 days) and AI-generated extra cards | Must | Mark a card "Missed it" and it returns in the same session |
| FR-07 | run a 5-question quiz with explanations, AI-generated on request, and save the score | Must | Finish a quiz; the score appears in Progress |
| FR-08 | build prosecution/plaintiff vs defence argument ladders (3–5 rounds of claim → counter → rebuttal → reply), mock-trial speaking notes, and a counter-check for one point | Must | Build a ladder on case 08; each round has a counter and a rebuttal |
| FR-09 | show only the tools each role is allowed to use | Must | Sign in as Study group; Add, Edit, Delete and AI controls are hidden |
| FR-10 | show a clear message when a required field is empty, a duplicate, or contains an IC or bank number | Should | Add a case with an empty name and a message appears |
| FR-11 | show progress per case and per theme, weakest first | Should | Review cards; weakest theme is listed first |
| FR-12 | let a student export all their data as JSON and import it back | Should | Export, delete one note, import, and the note is back |
| FR-13 | let lecturers add or correct cases and mark outcomes "verify latest outcome" | Should | Lecturer edits case 10's outcome; students see the change |
| FR-14 | show a feature roadmap and AI feature suggestions to students, lecturers and the builder | Could | Open the Features tab |

## NON-FUNCTIONAL REQUIREMENTS (workbook step 1.5)
| Quality | Target |
|---|---|
| Speed | Pages open in under 3 seconds; switching tabs takes under 1 second; AI output streams as it is generated |
| Easy to use | A new user can flip their first flashcard within 30 seconds of signing in, with no training |
| Devices | Phone first, also laptop; layout stacks to one column under 860px; no horizontal scrolling |
| Availability | 24/7 on Vercel; case bank, flashcards and quizzes still work if the AI is down |
| Data safety | Data stored in Supabase with daily backups; student export/import as JSON |
| Security | Real login; RLS on every table; the AI key stays on the server; AI routes limited to 20 requests per user per hour |
| Language | English |
| Privacy | Follows PDPA: inputs that look like an IC number (`\d{6}-?\d{2}-?\d{4}`) or a 10–16-digit bank/card number are refused with a clear message; no real personal data in seeds |
| Accuracy | The original verdict and the latest outcome are always shown separately; flagged cases show "verify latest outcome" |
| Accessibility | Keyboard-navigable, visible focus, readable contrast on every coloured background (white text on dark folders, dark text on lemon) |

## CRIMINOLOGY CONTENT RULES
Every AI request must include this system prompt, word for word:

> You are a criminology study assistant. Ground rules: separate the original verdict from the latest legal outcome, with years. Never present allegations as established facts; an acquittal means the standard of proof was not met, not factual innocence. Do not invent sources, quotations, judgment names, case numbers or dates — say what to verify instead. Handle victims, especially children, with restraint and no graphic detail. Use neutral academic language. If an outcome may have changed, say it needs verifying against court records. Plain text only, no markdown headings or asterisks.

- Argument ladders label anything not taken from the trial record as **"likely argument"**.
- Both sides of an argument get equal effort.
- For exonerated or quashed cases, present the prosecution's historical case and explain why it collapsed.
- Use "prosecution" for criminal cases and "plaintiff" for civil ones.
- Copy the AI prompt wording for summaries, ladders, mock-trial notes, the counter-check, flashcards, quizzes and resource suggestions from the `ask(...)` and `sample.json(...)` calls in `reference/caselab.html`.

## SEED DATA
Seed the `cases` table with all **16 cases** from the `CASES` array in `reference/caselab.html`. Each case has: id, name, jurisdiction, focus themes, overview, outcome and a `check` flag. Also seed the 7 extra flashcards for case 16 from the `EXTRA` object. Copy the text exactly; do not rewrite case facts.

## DATABASE (suggested; refine in your plan)
- `profiles`: id (auth uid), display_name, role (student | lecturer | peer | builder), class_id
- `classes`: id, name, join_code, lecturer_id
- `cases`: id, name, jurisdiction, focus[], overview, outcome, needs_verify, owner_id (null = shared bank), class_id
- `notes`: id, case_id, user_id, body, updated_at
- `resources`: id, case_id, user_id, title, kind, url, created_at
- `flashcards`: id, case_id, user_id (null = shared), front, back
- `card_progress`: user_id, flashcard_id, box, due_at
- `quiz_results`: id, user_id, case_id, score, total, taken_at

## DESIGN SYSTEM
The visual style is an "editorial archive collage": riso-primary, colour-coded folder tabs on a near-black desk, with condensed all-caps headlines, literary serif body text with drop caps, monospace captions, and layered paper ephemera.

- **Colours:**
  - desk `#141312`, ink `#1b1a18`, paper `#f3efe6`, paper-2 `#e9e3d6`
  - cobalt `#2547d0`, signal red `#d9271e`, emerald `#11795b`, lemon `#f4d81c`, violet `#5b2a86`, black `#0b0b0b`
  - sticky-note tints: pink `#f2b8c6`, mint `#a9dccb`, butter `#f7e39a`, lavender `#c9b8f0`
- **Fonts** (Google Fonts): Anton for headlines (uppercase), Libre Caslon Text for body and tab labels (italic on tabs), IBM Plex Mono for labels, captions and buttons.
- **Folder tabs:** the app sections (Summary, Resources, Flashcards, Quiz, Arguments, Progress, Features) are rounded folder tabs, each with its own colour. The folder body takes the colour of the active tab.
- **Content sheets:** content sits on off-white lined paper with hole punches and a red margin line. Sheets are rotated slightly (±0.35°), but scrolling containers are never rotated.
- **Case dossier header:** paper clip, "File 07 · US" label, big headline name, and theme chips styled as sticky notes.
- **Case bank:** an index-card drawer with a colour stripe per jurisdiction (Malaysia red, UK cobalt, US violet, Italy emerald, user cases lemon). Hover widens the stripe; never move the card sideways.
- **Buttons:** black "ink stamp" buttons with an offset shadow in the folder colour. On coloured folders, use white text and white outlines, and dark text on lemon.
- **Flashcards:** butter-yellow front, mint back.
- **Quiz answers:** correct answers are mint; wrong answers are struck through on pink.
- **Sign-in page:** same archive style, headline "OPEN THE CASE FILES", roles shown as coloured folder tabs.
- **Branding:** show the `codencode.my` wordmark (mint `.my`) in the header and on the sign-in page.

## MILESTONES
1. **Setup:** Next.js, Tailwind tokens and fonts, Supabase project, schema and RLS policies, seed of the 16 cases. Test: the case list loads from the database.
2. **Auth and roles:** sign-up/sign-in/sign-out, role and class code, role-based UI, admin role page. Test: FR-01 and FR-09.
3. **Case bank and summary:** search, add own case, dossier header, notes autosave, AI summary streaming. Test: FR-02, FR-03 and FR-10.
4. **Resources:** add, edit and remove resources, and AI source suggestions. Test: FR-04.
5. **Flashcards and quiz:** spaced repetition, AI cards, quiz with saved scores. Test: FR-06 and FR-07.
6. **Arguments:** ladder, mock-trial notes, counter-check. Test: FR-08.
7. **Progress, export and features:** themes weakest first, per-case table, JSON export/import, roadmap. Test: FR-11, FR-12 and FR-14.
8. **Polish and deploy:** mobile check at 400px, contrast check, rate limiting, error states, deploy to Vercel. Test: every NFR row.

## DONE MEANS
- Every FR "How I'll test it" step passes. Give me a check-off table at the end with FR ID, Pass/Fail and notes.
- `README.md` covers setup, the environment variables, how to seed, and how to deploy.
- No console errors, and no secrets in the repo.
