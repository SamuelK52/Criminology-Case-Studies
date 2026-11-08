-- CaseLab Criminology — Milestone 2: sign-in throttling, admin user list, class helpers.
-- Safe to re-run (tests re-run every migration; production applies each file once).

-- ---------------------------------------------------------------
-- Sign-in throttling: 10 failed attempts per email per 15 minutes.
-- The app role has no grants on this table; only the functions below touch it.
-- ---------------------------------------------------------------
create table if not exists public.login_failures (
  email      text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_failures_email_idx on public.login_failures (lower(email), created_at);
alter table public.login_failures enable row level security;   -- no policies: app role can't read it

create or replace function public.login_allowed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 10 from login_failures
  where lower(email) = lower(btrim(p_email)) and created_at > now() - interval '15 minutes'
$$;

create or replace function public.login_failed(p_email text)
returns void language sql security definer set search_path = public as $$
  delete from login_failures where created_at < now() - interval '1 day';
  insert into login_failures (email) values (left(lower(btrim(p_email)), 254));
$$;

create or replace function public.login_succeeded(p_email text)
returns void language sql security definer set search_path = public as $$
  delete from login_failures where lower(email) = lower(btrim(p_email));
$$;

-- ---------------------------------------------------------------
-- Admin page: the builder sees every account with its email.
-- (users.email is unreadable by the app role, so this goes through a checked function.)
-- ---------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, display_name text, role public.app_role,
               requested_role public.app_role, class_name text, join_code text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_builder() then
    raise exception 'Only the builder can see all accounts.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email, p.display_name, p.role, p.requested_role, c.name, c.join_code, u.created_at
    from users u
    join profiles p on p.id = u.id
    left join classes c on c.id = p.class_id
    order by (p.requested_role is null), u.created_at desc;
end $$;

-- ---------------------------------------------------------------
-- Classes page: leave your class (class_id can only change through functions).
-- ---------------------------------------------------------------
create or replace function public.leave_class()
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_id() is null then raise exception 'Sign in first.'; end if;
  update profiles set class_id = null where id = current_user_id();
end $$;

-- ---------------------------------------------------------------
-- Grants (0002 revokes execute on every function when it re-runs, so grant here too).
-- ---------------------------------------------------------------
revoke all on public.login_failures from public, caselab_app;
revoke execute on function
  public.login_allowed(text), public.login_failed(text), public.login_succeeded(text),
  public.admin_list_users(), public.leave_class()
  from public;
grant execute on function
  public.login_allowed(text), public.login_failed(text), public.login_succeeded(text),
  public.admin_list_users(), public.leave_class()
  to caselab_app;
