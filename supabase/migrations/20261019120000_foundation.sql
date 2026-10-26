-- Foundation: deny-by-default grants, shared enums/helpers, profiles and the admin activity log.
--
-- Row Level Security is THE authorization layer: the app talks to PostgREST with the publishable
-- key and the user's session. Every table in `public` has RLS on, and anon/authenticated only get
-- the table/column privileges granted explicitly below (function EXECUTE grants are all in the
-- last migration, 20261019120700_function_grants.sql).

-- Supabase grants ALL on new public tables/sequences/functions to anon and authenticated by
-- default. Turn that off so every new object starts closed and needs an explicit grant.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------
create type public.app_role as enum ('resident', 'admin');
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.neighborhood as enum (
  'english_avenue', 'vine_city', 'hunter_hills', 'washington_park', 'bankhead', 'knight_park',
  'dixie_hills', 'west_lake', 'center_hill', 'harvel_homes', 'georgia_tech'
);
create type public.text_size as enum ('default', 'large', 'extra_large');
create type public.app_language as enum ('en', 'es');
create type public.admin_action as enum (
  'role_granted', 'role_revoked',
  'account_suspended', 'account_banned', 'account_reactivated',
  'report_status_changed', 'report_edited', 'report_removed',
  'inquiry_status_changed',
  'notification_sent',
  'environment_reading_added',
  'data_exported'
);

-- ---------------------------------------------------------------------------------------------
-- Small pure helpers
-- ---------------------------------------------------------------------------------------------

-- ISO-8601 UTC with milliseconds, the format the app already parses ("2026-10-12T20:37:04.437Z").
create function public.iso_utc(p_at timestamptz)
returns text
language sql stable
set search_path = ''
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Plain-text sanitization for user-entered text (port of backend cleanText): drops control
-- characters (keeps tab/newline/CR) and HTML tags, trims, and turns '' into null.
create function public.clean_text(p_value text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(regexp_replace(p_value, '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'), '<[^>]*>', '', 'g')),
    ''
  )
$$;

-- Great-circle distance in km.
create function public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
set search_path = ''
as $$
  select 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- Banned, or suspended with no end (indefinite) or an end still in the future (decision Q-D:
-- a past suspended_until means access is allowed again; status is not written back).
create function public.account_is_blocked(p_status public.account_status, p_suspended_until timestamptz)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_status = 'banned'
      or (p_status = 'suspended' and (p_suspended_until is null or p_suspended_until > now()))
$$;

-- ---------------------------------------------------------------------------------------------
-- Profiles (one per auth.users row)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  email text,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{1,14}$'),
  role public.app_role not null default 'resident',
  status public.account_status not null default 'active',
  suspended_until timestamptz,
  neighborhood public.neighborhood,
  text_size public.text_size not null default 'default',
  language public.app_language not null default 'en',
  notif_health_warnings boolean not null default true,
  notif_community_announcements boolean not null default true,
  notif_meeting_reminders boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_suspended_until_only_when_suspended
    check (suspended_until is null or status = 'suspended')
);
comment on table public.profiles is
  'App profile per auth user. Residents may update only their editable columns (column privileges + profiles_guard trigger); role/status change only through admin_set_role/admin_set_status.';

create index profiles_role_status_idx on public.profiles (role, status);
create index profiles_email_idx on public.profiles (lower(email));

-- Role/state helpers used by RLS policies. SECURITY DEFINER so they can read profiles without
-- recursing into the profiles policies; they only ever reveal facts about the caller.
create function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and not public.account_is_blocked(p.status, p.suspended_until)
  )
$$;

create function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and not public.account_is_blocked(p.status, p.suspended_until)
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Admin activity log (append-only)
-- ---------------------------------------------------------------------------------------------
create table public.admin_activity_log (
  id bigint generated always as identity primary key,
  -- The acting admin (auth uid). Deliberately no foreign key: entries must survive account
  -- deletion, and an ON DELETE action would have to UPDATE this append-only table.
  -- Null for changes made outside a user session (SQL editor, scripts, webhooks).
  actor_id uuid,
  action public.admin_action not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_activity_log_created_idx on public.admin_activity_log (created_at desc, id desc);

create function public.admin_activity_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_activity_log is append-only' using errcode = '42501';
end
$$;

create trigger admin_activity_log_no_update_delete
  before update or delete on public.admin_activity_log
  for each row execute function public.admin_activity_log_append_only();
create trigger admin_activity_log_no_truncate
  before truncate on public.admin_activity_log
  for each statement execute function public.admin_activity_log_append_only();

-- The only writer. Not executable by anon/authenticated: entries come from triggers and
-- SECURITY DEFINER functions.
create function public.log_admin_action(
  p_action public.admin_action,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb,
  p_actor uuid default auth.uid()
)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.admin_activity_log (actor_id, action, target_type, target_id, details)
  values (p_actor, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------------------------
-- Profile creation from auth.users
-- ---------------------------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(public.clean_text(new.raw_user_meta_data ->> 'full_name'), '')), 100);
  v_phone text := btrim(coalesce(new.raw_user_meta_data ->> 'phone', ''));
begin
  if v_name = '' then
    -- Q-C: fall back to the email's local part.
    v_name := left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 100);
  end if;
  if v_name = '' then
    v_name := 'Resident';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{1,14}$' then
    v_phone := null; -- only valid E.164 numbers are kept
  end if;
  -- role/status always take their defaults (resident/active): user metadata is user-editable.
  insert into public.profiles (id, full_name, email, phone)
  values (new.id, v_name, new.email, v_phone)
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the email mirror (used for admin search) in step with Auth, the source of truth.
create function public.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Profiles for users that signed up before this migration (reads auth.users only).
insert into public.profiles (id, full_name, email)
select u.id,
       coalesce(
         nullif(left(btrim(coalesce(public.clean_text(u.raw_user_meta_data ->> 'full_name'), '')), 100), ''),
         nullif(left(split_part(coalesce(u.email, ''), '@', 1), 100), ''),
         'Resident'
       ),
       u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Profile rules: protected columns, last-admin invariant, audit
-- ---------------------------------------------------------------------------------------------

-- Last-admin invariant (data-model.md): at least one profile with role admin and status active.
-- The advisory lock serializes concurrent demotions so two admins can't demote each other.
create function public.assert_admin_remains(p_profile_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.profiles:last_admin_invariant'));
  if not exists (
    select 1 from public.profiles
    where role = 'admin' and status = 'active' and id <> p_profile_id
  ) then
    raise exception 'At least one active admin must remain'
      using errcode = 'P0001', hint = 'last_admin';
  end if;
end
$$;

-- BEFORE UPDATE. Defense in depth on top of the column privileges: a statement issued directly
-- by a client role (anon/authenticated) may not touch protected columns. Inside the admin RPCs
-- (SECURITY DEFINER) current_user is the function owner, so those paths pass.
create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.suspended_until is distinct from old.suspended_until
    or new.email is distinct from old.email
    or new.last_seen_at is distinct from old.last_seen_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Only admins can change role or account status' using errcode = '42501';
  end if;

  if old.role = 'admin' and old.status = 'active'
     and not (new.role = 'admin' and new.status = 'active') then
    perform public.assert_admin_remains(old.id);
  end if;

  new.full_name := btrim(new.full_name);
  new.updated_at := now();
  return new;
end
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

create function public.profiles_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active' then
    perform public.assert_admin_remains(old.id);
  end if;
  return old;
end
$$;

create trigger profiles_guard_delete
  before delete on public.profiles
  for each row execute function public.profiles_guard_delete();

-- AFTER UPDATE: role and account-status changes are audited on every path (RPC or SQL editor).
create function public.profiles_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform public.log_admin_action(
      case when new.role = 'admin' then 'role_granted' else 'role_revoked' end::public.admin_action,
      'profile', new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.status is distinct from old.status or new.suspended_until is distinct from old.suspended_until then
    perform public.log_admin_action(
      case new.status
        when 'banned' then 'account_banned'
        when 'suspended' then 'account_suspended'
        else 'account_reactivated'
      end::public.admin_action,
      'profile', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'suspendedUntil', public.iso_utc(new.suspended_until)));
  end if;
  return null;
end
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.profiles_audit();

-- Throttled (15 min) "last seen" stamp; the app calls it on launch / foreground.
create function public.touch_last_seen()
returns void
language sql security definer
set search_path = ''
as $$
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at < now() - interval '15 minutes')
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.admin_activity_log enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.admin_activity_log from anon, authenticated;
grant all on table public.profiles to service_role;
grant select, insert on table public.admin_activity_log to service_role;

-- Own row; admins see everyone. A blocked user can still read their own row so the app can
-- explain the suspension, but can't change it.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_update on public.profiles
  for update to authenticated
  using ((id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()))
  with check ((id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()));

grant select on table public.profiles to authenticated;
grant update (
  full_name, phone, neighborhood, text_size, language,
  notif_health_warnings, notif_community_announcements, notif_meeting_reminders
) on table public.profiles to authenticated;
-- No INSERT (the auth trigger creates profiles) and no DELETE (account deletion is Q-003).

create policy admin_activity_log_select on public.admin_activity_log
  for select to authenticated
  using ((select public.is_admin()));
grant select on table public.admin_activity_log to authenticated;
-- No INSERT/UPDATE/DELETE for anyone: writes go through log_admin_action().
