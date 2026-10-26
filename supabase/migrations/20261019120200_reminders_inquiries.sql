-- Event reminders (owner-only) and housing inquiries (+ private Storage bucket for attachments).
-- Events and housing programs live in Sanity; their document ids are stored as plain text.

-- ---------------------------------------------------------------------------------------------
-- Event reminders
-- ---------------------------------------------------------------------------------------------
create table public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 200),
  -- Copied by the app from Sanity when the reminder is created, so the cron can build the push
  -- without a content lookup (send-reminders refreshes them from Sanity when configured).
  event_title text check (event_title is null or char_length(event_title) <= 200),
  event_starts_at timestamptz not null,
  -- Computed by trigger (Q-004 default): 24 h before, else 1 h before, else now.
  remind_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_reminders_user_event_key unique (user_id, event_id)
);
create index event_reminders_due_idx on public.event_reminders (remind_at) where sent_at is null;

create function public.default_remind_at(p_starts_at timestamptz, p_now timestamptz default now())
returns timestamptz
language sql stable
set search_path = ''
as $$
  select case
    when p_starts_at - interval '24 hours' > p_now then p_starts_at - interval '24 hours'
    when p_starts_at - interval '1 hour' > p_now then p_starts_at - interval '1 hour'
    else p_now
  end
$$;

create function public.event_reminders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.user_id := auth.uid();
      new.sent_at := null;
      if new.event_starts_at <= now() then
        raise exception 'This event has already started' using errcode = '22023';
      end if;
    end if;
    new.event_title := public.clean_text(new.event_title);
    new.remind_at := public.default_remind_at(new.event_starts_at);
  elsif new.event_starts_at is distinct from old.event_starts_at then
    -- Rescheduled (send-reminders syncs from Sanity): compute again and re-arm.
    new.remind_at := public.default_remind_at(new.event_starts_at);
    new.sent_at := null;
  end if;
  return new;
end
$$;

create trigger event_reminders_before_write
  before insert or update on public.event_reminders
  for each row execute function public.event_reminders_before_write();

alter table public.event_reminders enable row level security;
revoke all on table public.event_reminders from anon, authenticated;
grant all on table public.event_reminders to service_role;

-- Owner only, admins included (an admin sees only their own reminders, like the backend).
create policy event_reminders_select on public.event_reminders
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy event_reminders_insert on public.event_reminders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy event_reminders_delete on public.event_reminders
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()));

grant select, delete on table public.event_reminders to authenticated;
grant insert (event_id, event_title, event_starts_at) on table public.event_reminders to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Housing inquiries
-- ---------------------------------------------------------------------------------------------
create type public.contact_method as enum ('email', 'phone');
create type public.inquiry_status as enum ('new', 'in_progress', 'closed');

create table public.housing_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  housing_program_id text not null check (char_length(housing_program_id) between 1 and 200),
  -- Snapshot of the Sanity program title at submission (for admin lists and exports).
  housing_program_title text check (housing_program_title is null or char_length(housing_program_title) <= 200),
  message text not null check (char_length(message) between 1 and 4000),
  preferred_contact public.contact_method not null,
  status public.inquiry_status not null default 'new',
  -- Admin-only: not selectable by residents (column privileges); admins read it through the
  -- admin_housing_inquiries view.
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index housing_inquiries_user_idx on public.housing_inquiries (user_id, created_at desc);
create index housing_inquiries_status_idx on public.housing_inquiries (status, created_at desc);

create function public.housing_inquiries_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.user_id := auth.uid();
      new.status := 'new';
      new.admin_notes := null;
      new.created_at := now();
    end if;
    new.message := public.clean_text(new.message);
    new.housing_program_title := public.clean_text(new.housing_program_title);
  else
    if current_user in ('anon', 'authenticated') then
      new.id := old.id;
      new.user_id := old.user_id;
      new.created_at := old.created_at;
    end if;
    if new.admin_notes is distinct from old.admin_notes then
      new.admin_notes := public.clean_text(new.admin_notes);
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger housing_inquiries_before_write
  before insert or update on public.housing_inquiries
  for each row execute function public.housing_inquiries_before_write();

create function public.housing_inquiries_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform public.log_admin_action('inquiry_status_changed', 'housing_inquiry', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end
$$;

create trigger housing_inquiries_audit
  after update on public.housing_inquiries
  for each row execute function public.housing_inquiries_audit();

alter table public.housing_inquiries enable row level security;
revoke all on table public.housing_inquiries from anon, authenticated;
grant all on table public.housing_inquiries to service_role;

create policy housing_inquiries_select on public.housing_inquiries
  for select to authenticated
  using ((user_id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()));
create policy housing_inquiries_insert on public.housing_inquiries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and (select public.is_active_user()));
create policy housing_inquiries_update on public.housing_inquiries
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Note: no SELECT on admin_notes, so clients must list columns explicitly (select=* fails).
grant select (id, user_id, housing_program_id, housing_program_title, message, preferred_contact, status, created_at, updated_at)
  on table public.housing_inquiries to authenticated;
grant insert (housing_program_id, housing_program_title, message, preferred_contact)
  on table public.housing_inquiries to authenticated;
grant update (status, admin_notes) on table public.housing_inquiries to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: private bucket, "{auth.uid()}/{inquiry_id}/{file}", PDF/JPEG/PNG/HEIC, 10 MB, ≤ 5.
-- Read through short-lived signed URLs (createSignedUrl), owner and admins only.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inquiry-attachments', 'inquiry-attachments', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function public.can_upload_inquiry_attachment(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_inquiry_id uuid;
begin
  if p_name is null
     or p_name !~* ('^' || v_uuid || '/' || v_uuid || '/[A-Za-z0-9._ -]{1,128}\.(pdf|jpe?g|png|heic)$') then
    return false;
  end if;
  if auth.uid() is null or split_part(p_name, '/', 1) <> auth.uid()::text or not public.is_active_user() then
    return false;
  end if;
  v_inquiry_id := split_part(p_name, '/', 2)::uuid;
  if not exists (
    select 1 from public.housing_inquiries i
    where i.id = v_inquiry_id
      and i.user_id = auth.uid()
      and i.created_at > now() - interval '24 hours'
  ) then
    return false;
  end if;
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'inquiry-attachments'
      and o.name like split_part(p_name, '/', 1) || '/' || split_part(p_name, '/', 2) || '/%'
  ) < 5;
end
$$;

create function public.can_read_inquiry_attachment(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return true;
  end if;
  return auth.uid() is not null
     and p_name is not null
     and split_part(p_name, '/', 1) = auth.uid()::text
     and public.is_active_user();
end
$$;

create policy "inquiry-attachments: owner uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inquiry-attachments' and (select public.can_upload_inquiry_attachment(name)));

create policy "inquiry-attachments: owner and admins read"
  on storage.objects for select to authenticated
  using (bucket_id = 'inquiry-attachments' and (select public.can_read_inquiry_attachment(name)));
