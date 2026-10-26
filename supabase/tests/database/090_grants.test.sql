-- Grants inventory: RLS on every table; exact anon/authenticated table and function privileges.
-- One transaction, rolled back at the end: safe to run against a shared database.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---- helpers (rolled back with the transaction) ---------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.create_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_meta, '{}'::jsonb, now(), now())
  returning id
$$;
create function tests.login(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;
create function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
-- Act as the database owner again (also clears the JWT claims).
create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;


-- Deny-by-default guard rails: these fail when a new table/view/function becomes reachable by
-- anon/authenticated without being reviewed. Update the expected lists deliberately.

select is(
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by c.relname::text collate "C"),
  array[]::text[],
  'every table in public has row level security enabled');

create temp table table_privs on commit drop as
select r.rolname as grantee, c.relname::text as rel, p.priv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) r(rolname)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  and has_table_privilege(r.rolname, c.oid, p.priv);

select is(
  array(select rel || ':' || priv from table_privs where grantee = 'anon' order by rel || ':' || priv collate "C"),
  array['public_blight_reports:SELECT'],
  'anon: only the public blight view is readable');

select is(
  array(select rel || ':' || priv from table_privs where grantee = 'authenticated' order by rel || ':' || priv collate "C"),
  array[
    'admin_activity:SELECT',
    'admin_activity_log:SELECT',
    'admin_housing_inquiries:SELECT',
    'alert_deliveries:SELECT',
    'blight_report_photos:DELETE',
    'blight_report_photos:SELECT',
    'blight_reports:SELECT',
    'event_reminders:DELETE',
    'event_reminders:SELECT',
    'profiles:SELECT',
    'public_blight_reports:SELECT'
  ],
  'authenticated: table-level privileges are exactly the reviewed set (rest is column-level or RLS-gated)');

select is(
  array(select a.attname::text from pg_attribute a
        where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') order by a.attname::text collate "C"),
  array['full_name', 'language', 'neighborhood', 'notif_community_announcements', 'notif_health_warnings',
        'notif_meeting_reminders', 'phone', 'text_size'],
  'profiles: residents can update only the editable columns');

select is(
  array(select a.attname::text from pg_attribute a
        where a.attrelid = 'public.blight_reports'::regclass and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') order by a.attname::text collate "C"),
  array['address', 'category', 'description', 'keep_name_private', 'latitude', 'longitude'],
  'blight_reports: clients cannot insert reporter_id, status or history');

select is(
  array(select a.attname::text from pg_attribute a
        where a.attrelid = 'public.housing_inquiries'::regclass and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT') order by a.attname::text collate "C"),
  array['created_at', 'housing_program_id', 'housing_program_title', 'id', 'message', 'preferred_contact', 'status',
        'updated_at', 'user_id'],
  'housing_inquiries: admin_notes is not selectable by clients');

create temp table function_privs on commit drop as
select r.rolname as grantee, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) r(rolname)
where n.nspname = 'public'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

select is(
  array(select fn from function_privs where grantee = 'anon' order by fn collate "C"),
  array[
    'environment_glance()',
    'environment_latest(p_lat double precision, p_lng double precision)',
    'haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)',
    'public_blight_reports_near(p_lat double precision, p_lng double precision, p_radius_km double precision)',
    'register_push_token(p_token text, p_platform text)',
    'unregister_push_token(p_token text)'
  ],
  'anon: only the reviewed public functions are executable');

select is(
  array(select fn from function_privs where grantee = 'authenticated' order by fn collate "C"),
  array[
    'admin_add_environment_reading(p_category environment_category, p_level environment_level, p_summary text, p_value numeric, p_unit text, p_source text, p_observed_at timestamp with time zone)',
    'admin_set_role(p_user_id uuid, p_role app_role)',
    'admin_set_status(p_user_id uuid, p_status account_status, p_suspended_until timestamp with time zone)',
    'admin_summary()',
    'can_attach_blight_photo(p_report_id bigint, p_storage_path text)',
    'can_read_blight_photo_object(p_name text)',
    'can_read_inquiry_attachment(p_name text)',
    'can_upload_blight_photo(p_name text)',
    'can_upload_inquiry_attachment(p_name text)',
    'clean_text(p_value text)',
    'default_remind_at(p_starts_at timestamp with time zone, p_now timestamp with time zone)',
    'environment_glance()',
    'environment_latest(p_lat double precision, p_lng double precision)',
    'export_blight_reports()',
    'export_housing_inquiries()',
    'haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)',
    'is_active_user()',
    'is_admin()',
    'iso_utc(p_at timestamp with time zone)',
    'nearby_blight_reports(p_category blight_category, p_lat double precision, p_lng double precision)',
    'public_blight_reports_near(p_lat double precision, p_lng double precision, p_radius_km double precision)',
    'register_push_token(p_token text, p_platform text)',
    'touch_last_seen()',
    'unregister_push_token(p_token text)'
  ],
  'authenticated: only the reviewed functions are executable');

select ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every SECURITY DEFINER function pins its search_path');

select ok(exists (select 1 from cron.job where jobname = 'hhha-send-reminders' and schedule = '*/5 * * * *'),
  'send-reminders is scheduled every 5 minutes');
select ok(exists (select 1 from cron.job where jobname = 'hhha-sync-environment' and schedule = '*/30 * * * *'),
  'sync-environment is scheduled every 30 minutes');
select ok(not has_function_privilege('authenticated', 'public.invoke_edge_function(text)', 'EXECUTE'),
  'clients cannot trigger the cron functions');

select * from finish();
rollback;
