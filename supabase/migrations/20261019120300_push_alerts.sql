-- Expo push tokens (guests too, Q-005) and the delivery record of Sanity alerts.

create type public.push_platform as enum ('ios', 'android');
create type public.alert_category as enum (
  'emergency', 'health_warning', 'community_announcement', 'meeting_reminder'
);

create table public.push_tokens (
  -- The token is the device's secret: whoever holds it may register or unregister it.
  token text primary key
    check (char_length(token) <= 255 and token ~ '^Expo(nent)?PushToken\[[^]]+\]$'),
  -- Null for guests. ON DELETE SET NULL keeps a deleted user's device on emergency alerts.
  user_id uuid references public.profiles (id) on delete set null,
  platform public.push_platform not null,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- No client privileges at all: register/unregister through the RPCs below; tokens are never
-- readable by clients.
alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from anon, authenticated;
grant all on table public.push_tokens to service_role;

-- Upsert the device token. Linked to the caller when signed in, unlinked for guests (also on
-- sign-out re-registration). Another account registering the same token takes it over (the
-- device changed hands).
create function public.register_push_token(p_token text, p_platform text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select p.id from public.profiles p where p.id = auth.uid());
  v_row public.push_tokens;
  v_created boolean;
begin
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'platform must be ios or android' using errcode = '22023';
  end if;
  if p_token is null or char_length(p_token) > 255 or p_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then
    raise exception 'Invalid Expo push token' using errcode = '22023';
  end if;

  insert into public.push_tokens as t (token, user_id, platform, last_registered_at)
  values (p_token, v_user, p_platform::public.push_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        last_registered_at = excluded.last_registered_at
  returning t.*, (t.xmax = 0) into v_row.token, v_row.user_id, v_row.platform, v_row.last_registered_at, v_row.created_at, v_created;

  return jsonb_build_object(
    'token', v_row.token,
    'platform', v_row.platform,
    'lastRegisteredAt', public.iso_utc(v_row.last_registered_at),
    'linkedToProfile', v_row.user_id is not null,
    'created', v_created
  );
end
$$;

-- Idempotent. Token possession is the authority (backend parity).
create function public.unregister_push_token(p_token text)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token
$$;

-- ---------------------------------------------------------------------------------------------
-- Alert deliveries (written by the send-alert Edge Function; alert content lives in Sanity)
-- ---------------------------------------------------------------------------------------------
create table public.alert_deliveries (
  alert_id text primary key check (char_length(alert_id) between 1 and 200), -- Sanity _id
  category public.alert_category not null,
  title text not null,
  ends_at timestamptz,
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  recipient_count integer,
  ok_count integer,
  removed_tokens integer,
  -- false when PUSH_ENABLED was off: recorded (so it is never sent later) but not pushed.
  pushed boolean not null default false
);
create index alert_deliveries_sent_idx on public.alert_deliveries (sent_at desc);

alter table public.alert_deliveries enable row level security;
revoke all on table public.alert_deliveries from anon, authenticated;
grant all on table public.alert_deliveries to service_role;

create policy alert_deliveries_select on public.alert_deliveries
  for select to authenticated
  using ((select public.is_admin()));
grant select on table public.alert_deliveries to authenticated;

-- Service-role helpers for the Edge Functions (not executable by anon/authenticated).

-- Recipients (port of backend selectRecipientTokens): emergency → every token, guests and
-- blocked accounts included (public safety, Q-005); other categories → tokens linked to an
-- account that is not blocked and has the matching preference on.
create function public.alert_recipient_tokens(p_category public.alert_category)
returns setof text
language sql stable
set search_path = ''
as $$
  select t.token
  from public.push_tokens t
  left join public.profiles p on p.id = t.user_id
  where p_category = 'emergency'
     or (
       p.id is not null
       and not public.account_is_blocked(p.status, p.suspended_until)
       and case p_category
             when 'health_warning' then p.notif_health_warnings
             when 'community_announcement' then p.notif_community_announcements
             when 'meeting_reminder' then p.notif_meeting_reminders
             else false
           end
     )
  order by t.token
$$;

-- Idempotency: true only for the first call per alert id. Later calls (re-publish, retried
-- webhook) only refresh title/ends_at.
create function public.claim_alert_delivery(
  p_alert_id text,
  p_category public.alert_category,
  p_title text,
  p_ends_at timestamptz default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_created boolean;
begin
  insert into public.alert_deliveries as d (alert_id, category, title, ends_at)
  values (p_alert_id, p_category, left(p_title, 200), p_ends_at)
  on conflict (alert_id) do update
    set title = excluded.title, ends_at = excluded.ends_at
  returning (d.xmax = 0) into v_created;
  return v_created;
end
$$;

create function public.finish_alert_delivery(
  p_alert_id text,
  p_recipient_count integer,
  p_ok_count integer,
  p_removed_tokens integer,
  p_pushed boolean
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_category public.alert_category;
begin
  update public.alert_deliveries
  set completed_at = now(),
      recipient_count = p_recipient_count,
      ok_count = p_ok_count,
      removed_tokens = p_removed_tokens,
      pushed = p_pushed
  where alert_id = p_alert_id
  returning category into v_category;

  perform public.log_admin_action('notification_sent', 'alert', p_alert_id,
    jsonb_build_object('via', 'sanity-webhook', 'category', v_category,
                       'recipientCount', p_recipient_count, 'pushed', p_pushed),
    null);
end
$$;

create function public.delete_push_tokens(p_tokens text[])
returns integer
language sql
set search_path = ''
as $$
  with gone as (delete from public.push_tokens where token = any (p_tokens) returning 1)
  select count(*)::integer from gone
$$;

-- Due event reminders, claimed atomically (sent_at set) so overlapping cron runs never send
-- twice. Skips users who are blocked (their reminders are claimed but get no tokens).
create function public.claim_due_event_reminders(p_limit integer default 500)
returns table (
  reminder_id uuid,
  user_id uuid,
  event_id text,
  event_title text,
  event_starts_at timestamptz,
  tokens text[]
)
language sql
set search_path = ''
as $$
  with due as (
    select r.id
    from public.event_reminders r
    where r.sent_at is null and r.remind_at <= now()
    order by r.remind_at
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
    for update skip locked
  ),
  claimed as (
    update public.event_reminders r
    set sent_at = now()
    from due
    where r.id = due.id
    returning r.id, r.user_id, r.event_id, r.event_title, r.event_starts_at
  )
  select c.id, c.user_id, c.event_id, c.event_title, c.event_starts_at,
         coalesce((
           select array_agg(t.token order by t.token)
           from public.push_tokens t
           join public.profiles p on p.id = t.user_id
           where t.user_id = c.user_id
             and not public.account_is_blocked(p.status, p.suspended_until)
         ), '{}'::text[])
  from claimed c
$$;
