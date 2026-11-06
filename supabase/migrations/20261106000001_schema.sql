-- CaseLab Criminology — schema
-- Tables, constraints and triggers. Row Level Security lives in the next migration.

do $$ begin
  create type public.app_role as enum ('student', 'lecturer', 'peer', 'builder');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- PDPA guard: refuse text that looks like a Malaysian IC number
-- (\d{6}-?\d{2}-?\d{4}) or a 10–16 digit bank/card number.
-- Mirrors src/lib/pii.ts so the database enforces it even if the UI is bypassed.
-- ---------------------------------------------------------------
create or replace function public.has_pii(t text)
returns boolean language sql immutable as $$
  select coalesce(t ~ '(^|[^0-9])[0-9]{6}-?[0-9]{2}-?[0-9]{4}([^0-9]|$)'
               or t ~ '(^|[^0-9])[0-9]{10,16}([^0-9]|$)', false)
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  join_code   text not null check (join_code ~ '^[A-Za-z0-9-]{4,32}$'),
  lecturer_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index if not exists classes_join_code_key on public.classes (upper(join_code));

-- ---------------------------------------------------------------
-- profiles (one per auth user, created by trigger on sign-up)
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 2 and 60 and not public.has_pii(display_name)),
  role           public.app_role not null default 'student',
  requested_role public.app_role,
  class_id       uuid references public.classes(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists profiles_class_idx on public.profiles (class_id);

-- ---------------------------------------------------------------
-- cases
--   owner_id null + class_id null  → shared case bank
--   owner_id set  + class_id null  → a user's private case
--   owner_id set  + class_id set   → a lecturer's case for one class
-- ---------------------------------------------------------------
create sequence if not exists public.cases_user_code_seq;

create table if not exists public.cases (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null check (char_length(btrim(name)) between 3 and 120 and not public.has_pii(name)),
  jurisdiction     text,
  focus            text[] not null default '{}',
  overview         text check (not public.has_pii(overview)),
  original_verdict text check (not public.has_pii(original_verdict)),
  latest_outcome   text check (not public.has_pii(latest_outcome)),
  needs_verify     boolean not null default false,
  owner_id         uuid references auth.users(id) on delete cascade,
  class_id         uuid references public.classes(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);
create unique index if not exists cases_code_key on public.cases (code);
-- Duplicate names: unique within the shared bank, and within each owner's own cases.
create unique index if not exists cases_name_scope_key
  on public.cases (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index if not exists cases_owner_idx on public.cases (owner_id);
create index if not exists cases_class_idx on public.cases (class_id);

-- ---------------------------------------------------------------
-- notes (one per user per case; autosaved)
-- ---------------------------------------------------------------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 50000 and not public.has_pii(body)),
  updated_at timestamptz not null default now(),
  unique (case_id, user_id)
);

-- ---------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------
create table if not exists public.resources (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shared     boolean not null default false,
  class_id   uuid references public.classes(id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 200 and not public.has_pii(title)),
  kind       text not null default 'Note' check (kind in ('Judgment', 'Article', 'Lecture', 'Book', 'Video', 'Note')),
  url        text not null default '' check (char_length(url) <= 1000 and not public.has_pii(url)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resources_case_idx on public.resources (case_id);
create index if not exists resources_user_idx on public.resources (user_id);

-- ---------------------------------------------------------------
-- flashcards
--   source 'derived'  — built from the case record by trigger (shared, user_id null)
--   source 'seed'     — hand-written seed cards (shared), e.g. case 16 EXTRA
--   source 'lecturer' — written by a lecturer (shared)
--   source 'ai'       — generated for one user (user_id set)
-- ---------------------------------------------------------------
create table if not exists public.flashcards (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  front      text not null check (char_length(front) between 1 and 500),
  back       text not null check (char_length(back) between 1 and 2000),
  source     text not null check (source in ('derived', 'seed', 'lecturer', 'ai')),
  slot       int,
  created_at timestamptz not null default now(),
  check ((source = 'ai') = (user_id is not null))
);
create index if not exists flashcards_case_idx on public.flashcards (case_id);
create unique index if not exists flashcards_derived_slot_key
  on public.flashcards (case_id, slot) where source in ('derived', 'seed');

-- ---------------------------------------------------------------
-- card_progress (spaced repetition: box 0–5)
-- ---------------------------------------------------------------
create table if not exists public.card_progress (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  box          smallint not null default 0 check (box between 0 and 5),
  due_at       timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

-- ---------------------------------------------------------------
-- quiz_results
-- ---------------------------------------------------------------
create table if not exists public.quiz_results (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id  uuid not null references public.cases(id) on delete cascade,
  score    int not null check (score >= 0),
  total    int not null check (total between 1 and 20),
  taken_at timestamptz not null default now(),
  check (score <= total)
);
create index if not exists quiz_results_user_idx on public.quiz_results (user_id, case_id);

-- ---------------------------------------------------------------
-- ai_usage (rate limit log; written only by ai_take_token())
-- ---------------------------------------------------------------
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  task       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();
drop trigger if exists resources_touch on public.resources;
create trigger resources_touch before update on public.resources for each row execute function public.touch_updated_at();
drop trigger if exists card_progress_touch on public.card_progress;
create trigger card_progress_touch before update on public.card_progress for each row execute function public.touch_updated_at();

-- Derived flashcards: the prototype's seedCards(), kept in step with the case record.
-- Slots 101–104 so hand-written seed cards (slots 1–n) come first, as in the prototype.
create or replace function public.upsert_derived_card(p_case uuid, p_slot int, p_front text, p_back text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_back is null or btrim(p_back) = '' then
    delete from flashcards where case_id = p_case and source = 'derived' and slot = p_slot;
  else
    insert into flashcards (case_id, front, back, source, slot)
    values (p_case, p_front, p_back, 'derived', p_slot)
    on conflict (case_id, slot) where source in ('derived', 'seed')
    do update set front = excluded.front, back = excluded.back;
  end if;
end $$;

create or replace function public.sync_derived_cards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform upsert_derived_card(new.id, 101,
    'Where and when: ' || new.name || '?',
    case when coalesce(btrim(new.overview), '') <> ''
         then coalesce(nullif(btrim(new.jurisdiction), ''), '—') || '. ' || new.overview end);
  perform upsert_derived_card(new.id, 102, 'What was the final legal outcome?', new.latest_outcome);
  perform upsert_derived_card(new.id, 103, 'Which criminology themes does it illustrate?',
    nullif(array_to_string(new.focus, ', '), ''));
  perform upsert_derived_card(new.id, 104, 'Original verdict vs latest outcome — why separate them?',
    'Convictions can be appealed, vacated, reinstated or quashed. ' ||
    case when new.needs_verify then 'This case has developments to verify.'
         else 'Check appeals before stating it as final.' end);
  return new;
end $$;

drop trigger if exists cases_derived_cards on public.cases;
create trigger cases_derived_cards after insert or update of name, jurisdiction, focus, overview, latest_outcome, needs_verify
  on public.cases for each row execute function public.sync_derived_cards();
