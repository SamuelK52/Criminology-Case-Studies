-- CaseLab Criminology — Row Level Security, helper functions, auth functions and RPCs.
-- Every table has RLS on. The UI hides controls too, but this file is what enforces the role matrix.
-- Policies apply to the app role (caselab_app). The table owner (used only for migrations) bypasses them.

-- ---------------------------------------------------------------
-- Helper functions (security definer so policies never recurse on profiles)
-- ---------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = current_user_id()
$$;

create or replace function public.my_class()
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from profiles where id = current_user_id()
$$;

create or replace function public.is_builder()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'builder' from profiles where id = current_user_id()), false)
$$;

-- Can the current user write content (notes, resources, own cases, AI)? Everyone except study group.
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('student', 'lecturer', 'builder') from profiles where id = current_user_id()), false)
$$;

-- Does the current user teach this class?
create or replace function public.teaches(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c join profiles p on p.id = c.lecturer_id
                 where c.id = p_class and c.lecturer_id = current_user_id() and p.role in ('lecturer', 'builder'))
$$;

create or replace function public.can_read_case(p_case uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c where c.id = p_case and (
      (c.owner_id is null and c.class_id is null)
      or c.owner_id = current_user_id()
      or (c.class_id is not null and (c.class_id = my_class() or teaches(c.class_id)))
      or is_builder()))
$$;

-- ---------------------------------------------------------------
-- Auth functions — the only way the app touches users/sessions.
-- ---------------------------------------------------------------
-- Sign-up. Builder is never self-assignable; Lecturer is a request the builder approves.
create or replace function public.create_user(
  p_email text, p_password_hash text, p_display_name text,
  p_requested_role text default 'student', p_class_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_name  text := btrim(coalesce(p_display_name, ''));
  v_code  text := btrim(coalesce(p_class_code, ''));
  v_class uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Enter a name of 2–60 characters.' using errcode = '22023';
  end if;
  if has_pii(v_name) or has_pii(p_email) then
    raise exception 'This looks like an IC or bank/card number.' using errcode = '22023';
  end if;
  if exists (select 1 from users where lower(email) = lower(btrim(p_email))) then
    raise exception 'An account with that email already exists.' using errcode = '23505';
  end if;
  if v_code <> '' then
    select id into v_class from classes where upper(join_code) = upper(v_code);
    if v_class is null then
      raise exception 'No class has the code %.', v_code using errcode = 'P0002';
    end if;
  end if;

  insert into users (email, password_hash) values (lower(btrim(p_email)), p_password_hash) returning id into v_id;
  insert into profiles (id, display_name, role, requested_role, class_id)
  values (v_id, v_name,
          case when p_requested_role = 'peer' then 'peer'::app_role else 'student'::app_role end,
          case when p_requested_role = 'lecturer' then 'lecturer'::app_role end,
          v_class);
  return v_id;
end $$;

-- Sign-in step 1: fetch the stored hash so the app can verify the password.
create or replace function public.get_login(p_email text)
returns table (id uuid, password_hash text) language sql stable security definer set search_path = public as $$
  select id, password_hash from users where lower(email) = lower(btrim(p_email))
$$;

-- Sign-in step 2: store a session (sha256 of the cookie token).
create or replace function public.create_session(p_user uuid, p_token_hash text, p_days int default 30)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_exp timestamptz := now() + make_interval(days => least(greatest(p_days, 1), 90));
begin
  delete from sessions where user_id = p_user and expires_at < now();
  insert into sessions (token_hash, user_id, expires_at) values (p_token_hash, p_user, v_exp);
  return v_exp;
end $$;

-- Every request: which user does this cookie belong to?
create or replace function public.resolve_session(p_token_hash text)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from sessions where token_hash = p_token_hash and expires_at > now()
$$;

create or replace function public.delete_session(p_token_hash text)
returns void language sql security definer set search_path = public as $$
  delete from sessions where token_hash = p_token_hash
$$;

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------
create or replace function public.class_code_exists(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where upper(join_code) = upper(btrim(p_code)))
$$;

create or replace function public.join_class(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  if current_user_id() is null then raise exception 'Sign in first.'; end if;
  select id into v_class from classes where upper(join_code) = upper(btrim(p_code));
  if v_class is null then raise exception 'No class has the code %.', p_code using errcode = 'P0002'; end if;
  update profiles set class_id = v_class where id = current_user_id();
  return v_class;
end $$;

-- Builder only: change a user's role (also clears a pending lecturer request).
create or replace function public.set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_builder() then raise exception 'Only the builder can change roles.' using errcode = '42501'; end if;
  if p_user = current_user_id() and p_role <> 'builder' and
     (select count(*) from profiles where role = 'builder') <= 1 then
    raise exception 'You are the only builder — make someone else builder first.';
  end if;
  update profiles set role = p_role, requested_role = null where id = p_user;
end $$;

-- Rate limit: 20 AI requests per user per rolling hour. Checks and records in one locked step.
create or replace function public.ai_take_token(p_task text)
returns table (allowed boolean, used int, retry_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_used int; v_oldest timestamptz; v_limit constant int := 20;
begin
  if current_user_id() is null or not can_write() then
    return query select false, 0, null::timestamptz; return;
  end if;
  perform pg_advisory_xact_lock(hashtext('ai:' || current_user_id()::text));
  select count(*), min(created_at) into v_used, v_oldest
    from ai_usage where user_id = current_user_id() and created_at > now() - interval '1 hour';
  if v_used >= v_limit then
    return query select false, v_used, v_oldest + interval '1 hour'; return;
  end if;
  insert into ai_usage (user_id, task) values (current_user_id(), left(p_task, 40));
  return query select true, v_used + 1, null::timestamptz;
end $$;

-- ---------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------
-- Cases: assign codes to user-made cases; stop non-builders changing ownership or codes.
create or replace function public.cases_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- No user id = migration/seed run by the owner: keep the given code (e.g. '07').
    if current_user_id() is not null and not is_builder() then
      new.owner_id := current_user_id();
      new.code := null;
    end if;
    if new.code is null then
      new.code := 'U' || nextval('cases_user_code_seq');
    end if;
    -- A user's own case may not duplicate a shared-bank name either.
    if new.owner_id is not null and exists (
         select 1 from cases where owner_id is null and lower(btrim(name)) = lower(btrim(new.name))) then
      raise exception 'That case is already in the list.' using errcode = '23505';
    end if;
  else
    if current_user_id() is not null and not is_builder() then
      new.owner_id := old.owner_id;
      new.code := old.code;
      new.class_id := old.class_id;
    end if;
    new.updated_at := now();
  end if;
  new.updated_by := current_user_id();
  return new;
end $$;

drop trigger if exists cases_guard on public.cases;
create trigger cases_guard before insert or update on public.cases
  for each row execute function public.cases_guard();

-- ---------------------------------------------------------------
-- Privileges. RLS decides which rows; grants decide which tables/columns.
-- ---------------------------------------------------------------
revoke all on all tables in schema public from public, caselab_app;
grant usage on schema public to caselab_app;

grant select, insert, update, delete on
  public.cases, public.notes, public.resources, public.flashcards,
  public.card_progress, public.quiz_results, public.classes
  to caselab_app;
grant select on public.ai_usage to caselab_app;
grant select on public.profiles to caselab_app;
grant update (display_name) on public.profiles to caselab_app;  -- role/class only via functions
grant usage, select on sequence public.cases_user_code_seq to caselab_app;
-- No grants at all on public.users or public.sessions.

revoke execute on all functions in schema public from public;
grant execute on function
  public.current_user_id(), public.has_pii(text),
  public.my_role(), public.my_class(), public.is_builder(), public.can_write(),
  public.teaches(uuid), public.can_read_case(uuid),
  public.create_user(text, text, text, text, text), public.get_login(text),
  public.create_session(uuid, text, int), public.resolve_session(text), public.delete_session(text),
  public.class_code_exists(text), public.join_class(text),
  public.set_user_role(uuid, public.app_role), public.ai_take_token(text)
  to caselab_app;

-- ---------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------
alter table public.users         enable row level security;   -- no policies: app role can't read it
alter table public.sessions      enable row level security;   -- no policies: app role can't read it
alter table public.profiles      enable row level security;
alter table public.classes       enable row level security;
alter table public.cases         enable row level security;
alter table public.notes         enable row level security;
alter table public.resources     enable row level security;
alter table public.flashcards    enable row level security;
alter table public.card_progress enable row level security;
alter table public.quiz_results  enable row level security;
alter table public.ai_usage      enable row level security;

-- Drop existing policies so this file can be re-run.
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles --------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (id = current_user_id() or is_builder() or (class_id is not null and teaches(class_id)));
create policy profiles_update_self on public.profiles for update
  using (id = current_user_id()) with check (id = current_user_id());

-- classes ---------------------------------------------------------
create policy classes_select on public.classes for select
  using (lecturer_id = current_user_id() or id = my_class() or is_builder());
create policy classes_insert on public.classes for insert
  with check (lecturer_id = current_user_id() and my_role() in ('lecturer', 'builder'));
create policy classes_update on public.classes for update
  using (lecturer_id = current_user_id() or is_builder())
  with check (lecturer_id = current_user_id() or is_builder());
create policy classes_delete on public.classes for delete
  using (lecturer_id = current_user_id() or is_builder());

-- cases (signed-out visitors may read the shared bank) ------------
create policy cases_select on public.cases for select
  using (
    (owner_id is null and class_id is null)
    or owner_id = current_user_id()
    or (class_id is not null and (class_id = my_class() or teaches(class_id)))
    or is_builder());
create policy cases_insert on public.cases for insert
  with check (
    is_builder()
    or (my_role() = 'student'  and owner_id = current_user_id() and class_id is null)
    or (my_role() = 'lecturer' and owner_id = current_user_id() and (class_id is null or teaches(class_id))));
create policy cases_update on public.cases for update
  using (
    is_builder()
    or (can_write() and owner_id = current_user_id())
    or (my_role() = 'lecturer' and ((owner_id is null and class_id is null) or teaches(class_id))))
  with check (
    is_builder()
    or (can_write() and owner_id = current_user_id())
    or (my_role() = 'lecturer' and ((owner_id is null and class_id is null) or teaches(class_id))));
create policy cases_delete on public.cases for delete
  using (is_builder() or (can_write() and owner_id = current_user_id()));

-- notes (private to the author) -----------------------------------
create policy notes_select on public.notes for select
  using (user_id = current_user_id() or is_builder());
create policy notes_insert on public.notes for insert
  with check (user_id = current_user_id() and can_write() and can_read_case(case_id));
create policy notes_update on public.notes for update
  using (user_id = current_user_id() and can_write())
  with check (user_id = current_user_id() and can_write());
create policy notes_delete on public.notes for delete
  using ((user_id = current_user_id() and can_write()) or is_builder());

-- resources -------------------------------------------------------
create policy resources_select on public.resources for select
  using (
    user_id = current_user_id()
    or (shared and current_user_id() is not null and class_id is null)
    or (shared and (class_id = my_class() or teaches(class_id)))
    or is_builder());
create policy resources_insert on public.resources for insert
  with check (
    user_id = current_user_id() and can_write() and can_read_case(case_id) and (
      (not shared and class_id is null)
      or (shared and my_role() = 'lecturer' and teaches(class_id))
      or is_builder()));
create policy resources_update on public.resources for update
  using ((user_id = current_user_id() and can_write())
         or (shared and my_role() = 'lecturer' and teaches(class_id))
         or is_builder())
  with check ((user_id = current_user_id() and can_write() and ((not shared and class_id is null) or teaches(class_id)))
         or (shared and my_role() = 'lecturer' and teaches(class_id))
         or is_builder());
create policy resources_delete on public.resources for delete
  using ((user_id = current_user_id() and can_write()) or is_builder());

-- flashcards ------------------------------------------------------
create policy flashcards_select on public.flashcards for select
  using ((user_id is null and can_read_case(case_id)) or user_id = current_user_id() or is_builder());
create policy flashcards_insert on public.flashcards for insert
  with check (
    can_read_case(case_id) and (
      (source = 'ai' and user_id = current_user_id() and can_write())
      or (source = 'lecturer' and user_id is null and my_role() in ('lecturer', 'builder'))
      or is_builder()));
create policy flashcards_update on public.flashcards for update
  using ((user_id = current_user_id() and can_write()) or (source = 'lecturer' and my_role() = 'lecturer') or is_builder())
  with check ((user_id = current_user_id() and can_write()) or (source = 'lecturer' and my_role() = 'lecturer') or is_builder());
create policy flashcards_delete on public.flashcards for delete
  using ((user_id = current_user_id() and can_write()) or is_builder());

-- card_progress (everyone, including study group, keeps their own) -
create policy card_progress_select on public.card_progress for select
  using (user_id = current_user_id() or is_builder());
create policy card_progress_insert on public.card_progress for insert
  with check (user_id = current_user_id());
create policy card_progress_update on public.card_progress for update
  using (user_id = current_user_id()) with check (user_id = current_user_id());
create policy card_progress_delete on public.card_progress for delete
  using ((user_id = current_user_id() and can_write()) or is_builder());   -- "Reset progress" is hidden from study group

-- quiz_results ----------------------------------------------------
create policy quiz_results_select on public.quiz_results for select
  using (user_id = current_user_id() or is_builder());
create policy quiz_results_insert on public.quiz_results for insert
  with check (user_id = current_user_id() and can_read_case(case_id));
create policy quiz_results_delete on public.quiz_results for delete
  using ((user_id = current_user_id() and can_write()) or is_builder());

-- ai_usage (read own; written only by ai_take_token) --------------
create policy ai_usage_select on public.ai_usage for select
  using (user_id = current_user_id() or is_builder());
