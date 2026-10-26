-- Admin surface: role/status RPCs (last-admin invariant), dashboard summary, admin read views,
-- and logged CSV exports without contact details (Q-007 default).

create function public.admin_set_role(p_user_id uuid, p_role public.app_role)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'role must be resident or admin' using errcode = '22023';
  end if;
  -- profiles_guard enforces the last-admin invariant; profiles_audit logs the change.
  update public.profiles set role = p_role where id = p_user_id returning * into v_profile;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return v_profile;
end
$$;

create function public.admin_set_status(
  p_user_id uuid,
  p_status public.account_status,
  p_suspended_until timestamptz default null
)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'status must be active, suspended or banned' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'You can''t suspend or ban your own account' using errcode = 'P0001';
  end if;
  if p_suspended_until is not null and p_status <> 'suspended' then
    raise exception 'suspended_until only applies to suspended' using errcode = '22023';
  end if;
  if p_suspended_until is not null and p_suspended_until <= now() then
    raise exception 'suspended_until must be in the future' using errcode = '22023';
  end if;
  update public.profiles
  set status = p_status,
      suspended_until = case when p_status = 'suspended' then p_suspended_until end
  where id = p_user_id
  returning * into v_profile;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return v_profile;
end
$$;

-- Dashboard counts. (Upcoming events come from Sanity, so they're not here.)
create function public.admin_summary()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'reports', (
      select jsonb_build_object(
        'submitted', count(*) filter (where status = 'submitted'),
        'underReview', count(*) filter (where status = 'under_review'),
        'active', count(*) filter (where status in ('submitted', 'under_review', 'reported_to_city')))
      from public.blight_reports),
    'inquiries', (
      select jsonb_build_object(
        'new', count(*) filter (where status = 'new'),
        'open', count(*) filter (where status in ('new', 'in_progress')))
      from public.housing_inquiries),
    'users', (
      select jsonb_build_object(
        'residents', count(*) filter (where role = 'resident'),
        'admins', count(*) filter (where role = 'admin'),
        'suspendedOrBanned', count(*) filter (where status in ('suspended', 'banned')))
      from public.profiles),
    'notifications', (
      select jsonb_build_object('sentLast30Days', count(*))
      from public.alert_deliveries where sent_at >= now() - interval '30 days')
  );
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Admin read views (owner's rights + an is_admin() gate; empty for everyone else)
-- ---------------------------------------------------------------------------------------------
create view public.admin_activity
with (security_barrier = true)
as
select l.id, l.action, l.target_type, l.target_id, l.details, l.actor_id,
       p.full_name as actor_full_name, l.created_at
from public.admin_activity_log l
left join public.profiles p on p.id = l.actor_id
where (select public.is_admin());
comment on view public.admin_activity is 'Admin activity log with the actor''s name. Admins only (empty otherwise).';

create view public.admin_housing_inquiries
with (security_barrier = true)
as
select i.id, i.user_id, i.housing_program_id, i.housing_program_title, i.message,
       i.preferred_contact, i.status, i.admin_notes, i.created_at, i.updated_at,
       p.full_name as resident_full_name, p.email as resident_email, p.phone as resident_phone,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'path', o.name,
                  'name', regexp_replace(o.name, '^.*/', ''),
                  'mimeType', o.metadata ->> 'mimetype',
                  'size', (o.metadata ->> 'size')::bigint)
                order by o.created_at, o.name)
         from storage.objects o
         where o.bucket_id = 'inquiry-attachments'
           and o.name like i.user_id::text || '/' || i.id::text || '/%'
       ), '[]'::jsonb) as attachments
from public.housing_inquiries i
join public.profiles p on p.id = i.user_id
where (select public.is_admin());
comment on view public.admin_housing_inquiries is
  'Inquiries with admin notes, resident contact details and attachment object paths (bucket inquiry-attachments; read with signed URLs). Admins only (empty otherwise).';

-- ---------------------------------------------------------------------------------------------
-- CSV exports (call with Accept: text/csv, e.g. supabase.rpc(...).csv()). Admin-only, logged as
-- data_exported, no reporter or contact details, and cells that would start a spreadsheet
-- formula are prefixed with an apostrophe.
-- ---------------------------------------------------------------------------------------------
create function public.csv_safe(p_value text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when p_value ~ '^[=+\-@\t\r]' then '''' || p_value else p_value end
$$;

create function public.export_blight_reports()
returns table (
  id bigint,
  category public.blight_category,
  status public.blight_status,
  latitude numeric,
  longitude numeric,
  address text,
  description text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select count(*) into v_rows from public.blight_reports;
  perform public.log_admin_action('data_exported', 'blight_reports', null,
    jsonb_build_object('rows', v_rows,
      'columns', jsonb_build_array('id', 'category', 'status', 'latitude', 'longitude', 'address', 'description', 'created_at', 'resolved_at')));
  return query
  select r.id, r.category, r.status, r.latitude, r.longitude,
         public.csv_safe(r.address), public.csv_safe(r.description), r.created_at, r.resolved_at
  from public.blight_reports r
  order by r.created_at, r.id;
end
$$;

create function public.export_housing_inquiries()
returns table (
  id uuid,
  housing_program_id text,
  housing_program_title text,
  status public.inquiry_status,
  preferred_contact public.contact_method,
  created_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select count(*) into v_rows from public.housing_inquiries;
  perform public.log_admin_action('data_exported', 'housing_inquiries', null,
    jsonb_build_object('rows', v_rows,
      'columns', jsonb_build_array('id', 'housing_program_id', 'housing_program_title', 'status', 'preferred_contact', 'created_at')));
  return query
  select i.id, public.csv_safe(i.housing_program_id), public.csv_safe(i.housing_program_title),
         i.status, i.preferred_contact, i.created_at
  from public.housing_inquiries i
  order by i.created_at, i.id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Initial admin (Q-001): run by the team from the SQL editor / psql, never by clients.
--   select public.promote_admin_by_email('someone@example.org');
-- ---------------------------------------------------------------------------------------------
create function public.promote_admin_by_email(p_email text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_matches integer;
  v_profile public.profiles;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Usage: select public.promote_admin_by_email(''user@example.com'')' using errcode = '22023';
  end if;
  select count(*) into v_matches from public.profiles where lower(email) = v_email;
  if v_matches = 0 then
    raise exception 'No profile for that email. The user must sign up first.' using errcode = 'P0002';
  elsif v_matches > 1 then
    raise exception 'More than one profile has that email' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where lower(email) = v_email;
  if v_profile.status = 'banned' then
    raise exception 'That account is banned. Reactivate it before promoting.' using errcode = 'P0001';
  end if;
  if v_profile.role = 'admin' then
    return v_email || ' is already an admin.';
  end if;
  update public.profiles set role = 'admin' where id = v_profile.id; -- logged by profiles_audit (actor null)
  return v_email || ' is now an admin.';
end
$$;

revoke all on table public.admin_activity, public.admin_housing_inquiries from anon, authenticated;
grant select on table public.admin_activity, public.admin_housing_inquiries to authenticated, service_role;
