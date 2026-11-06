-- CaseLab Criminology — Row Level Security, helper functions and RPCs.
-- Every table has RLS on. The UI hides controls too, but this file is what enforces the role matrix.

-- ---------------------------------------------------------------
-- Helper functions (security definer so policies never recurse on profiles)
-- ---------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.my_class()
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from profiles where id = auth.uid()
$$;

create or replace function public.is_builder()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'builder' from profiles where id = auth.uid()), false)
$$;

-- Can the current user write content (notes, resources, own cases, AI)? Everyone except study group.
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('student', 'lecturer', 'builder') from profiles where id = auth.uid()), false)
$$;

-- Classes the current user teaches.
create or replace function public.teaches(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c join profiles p on p.id = c.lecturer_id
                 where c.id = p_class and c.lecturer_id = auth.uid() and p.role in ('lecturer', 'builder'))
$$;

create or replace function public.can_read_case(p_case uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c where c.id = p_case and (
      (c.owner_id is null and c.class_id is null)
      or c.owner_id = auth.uid()
      or (c.class_id is not null and (c.class_id = my_class() or teaches(c.class_id)))
      or is_builder()))
$$;

-- ---------------------------------------------------------------
-- Sign-up: create the profile from auth metadata.
-- Builder is never self-assignable. Lecturer is a request the builder approves.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_req   text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'student');
  v_code  text := btrim(coalesce(new.raw_user_meta_data ->> 'class_code', ''));
  v_class uuid;
begin
  if char_length(v_name) < 2 or has_pii(v_name) then
    v_name := 'New user';
  end if;
  v_name := left(v_name, 60);
  if v_code <> '' then
    select id into v_class from classes where upper(join_code) = upper(v_code);
  end if;
  insert into profiles (id, display_name, role, requested_role, class_id)
  values (new.id, v_name,
          case when v_req = 'peer' then 'peer'::app_role else 'student'::app_role end,
          case when v_req = 'lecturer' then 'lecturer'::app_role end,
          v_class);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------
-- Is a class code valid? Used by the sign-up form before creating the account.
create or replace function public.class_code_exists(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where upper(join_code) = upper(btrim(p_code)))
$$;

-- Join a class after sign-up.
create or replace function public.join_class(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select id into v_class from classes where upper(join_code) = upper(btrim(p_code));
  if v_class is null then raise exception 'No class has the code %.', p_code using errcode = 'P0002'; end if;
  update profiles set class_id = v_class where id = auth.uid();
  return v_class;
end $$;

-- Builder only: change a user's role (also clears a pending lecturer request).
create or replace function public.set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_builder() then raise exception 'Only the builder can change roles.' using errcode = '42501'; end if;
  if p_user = auth.uid() and p_role <> 'builder' and
     (select count(*) from profiles where role = 'builder') <= 1 then
    raise exception 'You are the only builder — make someone else builder first.';
  end if;
  update profiles set role = p_role, requested_role = null where id = p_user;
end $$;

-- Rate limit: 20 AI requests per user per rolling hour. Checks and records in one step.
create or replace function public.ai_take_token(p_task text)
returns table (allowed boolean, used int, retry_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_used int; v_oldest timestamptz; v_limit constant int := 20;
begin
  if auth.uid() is null or not can_write() then
    return query select false, 0, null::timestamptz; return;
  end if;
  perform pg_advisory_xact_lock(hashtext('ai:' || auth.uid()::text));
  select count(*), min(created_at) into v_used, v_oldest
    from ai_usage where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_used >= v_limit then
    return query select false, v_used, v_oldest + interval '1 hour'; return;
  end if;
  insert into ai_usage (user_id, task) values (auth.uid(), left(p_task, 40));
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
    -- auth.uid() is null for SQL/seed runs: keep the given code (e.g. '07').
    if auth.uid() is not null and not is_builder() then
      new.owner_id := auth.uid();
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
    if not is_builder() and auth.uid() is not null then
      new.owner_id := old.owner_id;
      new.code := old.code;
      new.class_id := old.class_id;
    end if;
    new.updated_at := now();
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists cases_guard on public.cases;
create trigger cases_guard before insert or update on public.cases
  for each row execute function public.cases_guard();

-- ---------------------------------------------------------------
-- Privileges. RLS decides which rows; grants decide which columns.
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on public.cases to anon;  -- shared bank only (see policy)
grant select, insert, update, delete on
  public.cases, public.notes, public.resources, public.flashcards,
  public.card_progress, public.quiz_results, public.classes
  to authenticated;
grant select on public.ai_usage to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;  -- role/class only via RPCs
grant usage, select on sequence public.cases_user_code_seq to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.my_role(), public.my_class(), public.is_builder(), public.can_write(),
  public.teaches(uuid), public.can_read_case(uuid), public.has_pii(text),
  public.join_class(text), public.set_user_role(uuid, public.app_role), public.ai_take_token(text)
  to authenticated;
grant execute on function public.class_code_exists(text), public.has_pii(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------
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
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or is_builder() or (class_id is not null and teaches(class_id)));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- classes ---------------------------------------------------------
create policy classes_select on public.classes for select to authenticated
  using (lecturer_id = auth.uid() or id = my_class() or is_builder());
create policy classes_insert on public.classes for insert to authenticated
  with check (lecturer_id = auth.uid() and my_role() in ('lecturer', 'builder'));
create policy classes_update on public.classes for update to authenticated
  using (lecturer_id = auth.uid() or is_builder()) with check (lecturer_id = auth.uid() or is_builder());
create policy classes_delete on public.classes for delete to authenticated
  using (lecturer_id = auth.uid() or is_builder());

-- cases -----------------------------------------------------------
create policy cases_select_anon on public.cases for select to anon
  using (owner_id is null and class_id is null);
create policy cases_select on public.cases for select to authenticated
  using (
    (owner_id is null and class_id is null)
    or owner_id = auth.uid()
    or (class_id is not null and (class_id = my_class() or teaches(class_id)))
    or is_builder());
create policy cases_insert on public.cases for insert to authenticated
  with check (
    is_builder()
    or (my_role() = 'student'  and owner_id = auth.uid() and class_id is null)
    or (my_role() = 'lecturer' and owner_id = auth.uid() and (class_id is null or teaches(class_id))));
create policy cases_update on public.cases for update to authenticated
  using (
    is_builder()
    or (can_write() and owner_id = auth.uid())
    or (my_role() = 'lecturer' and ((owner_id is null and class_id is null) or teaches(class_id))))
  with check (
    is_builder()
    or (can_write() and owner_id = auth.uid())
    or (my_role() = 'lecturer' and ((owner_id is null and class_id is null) or teaches(class_id))));
create policy cases_delete on public.cases for delete to authenticated
  using (is_builder() or (can_write() and owner_id = auth.uid()));

-- notes (private to the author) -----------------------------------
create policy notes_select on public.notes for select to authenticated
  using (user_id = auth.uid() or is_builder());
create policy notes_insert on public.notes for insert to authenticated
  with check (user_id = auth.uid() and can_write() and can_read_case(case_id));
create policy notes_update on public.notes for update to authenticated
  using (user_id = auth.uid() and can_write()) with check (user_id = auth.uid() and can_write());
create policy notes_delete on public.notes for delete to authenticated
  using ((user_id = auth.uid() and can_write()) or is_builder());

-- resources -------------------------------------------------------
create policy resources_select on public.resources for select to authenticated
  using (
    user_id = auth.uid()
    or (shared and class_id is null)
    or (shared and (class_id = my_class() or teaches(class_id)))
    or is_builder());
create policy resources_insert on public.resources for insert to authenticated
  with check (
    user_id = auth.uid() and can_write() and can_read_case(case_id) and (
      (not shared and class_id is null)
      or (shared and my_role() = 'lecturer' and teaches(class_id))
      or is_builder()));
create policy resources_update on public.resources for update to authenticated
  using ((user_id = auth.uid() and can_write())
         or (shared and my_role() = 'lecturer' and teaches(class_id))
         or is_builder())
  with check ((user_id = auth.uid() and can_write() and ((not shared and class_id is null) or teaches(class_id)))
         or (shared and my_role() = 'lecturer' and teaches(class_id))
         or is_builder());
create policy resources_delete on public.resources for delete to authenticated
  using ((user_id = auth.uid() and can_write()) or is_builder());

-- flashcards ------------------------------------------------------
create policy flashcards_select on public.flashcards for select to authenticated
  using ((user_id is null and can_read_case(case_id)) or user_id = auth.uid() or is_builder());
create policy flashcards_insert on public.flashcards for insert to authenticated
  with check (
    can_read_case(case_id) and (
      (source = 'ai' and user_id = auth.uid() and can_write())
      or (source = 'lecturer' and user_id is null and my_role() in ('lecturer', 'builder'))
      or is_builder()));
create policy flashcards_update on public.flashcards for update to authenticated
  using ((user_id = auth.uid() and can_write()) or (source = 'lecturer' and my_role() = 'lecturer') or is_builder())
  with check ((user_id = auth.uid() and can_write()) or (source = 'lecturer' and my_role() = 'lecturer') or is_builder());
create policy flashcards_delete on public.flashcards for delete to authenticated
  using ((user_id = auth.uid() and can_write()) or is_builder());

-- card_progress (everyone, including study group, keeps their own) -
create policy card_progress_select on public.card_progress for select to authenticated
  using (user_id = auth.uid() or is_builder());
create policy card_progress_insert on public.card_progress for insert to authenticated
  with check (user_id = auth.uid());
create policy card_progress_update on public.card_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy card_progress_delete on public.card_progress for delete to authenticated
  using ((user_id = auth.uid() and can_write()) or is_builder());   -- "Reset progress" is hidden from study group

-- quiz_results ----------------------------------------------------
create policy quiz_results_select on public.quiz_results for select to authenticated
  using (user_id = auth.uid() or is_builder());
create policy quiz_results_insert on public.quiz_results for insert to authenticated
  with check (user_id = auth.uid() and can_read_case(case_id));
create policy quiz_results_delete on public.quiz_results for delete to authenticated
  using ((user_id = auth.uid() and can_write()) or is_builder());

-- ai_usage (read own; written only by ai_take_token) --------------
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = auth.uid() or is_builder());
