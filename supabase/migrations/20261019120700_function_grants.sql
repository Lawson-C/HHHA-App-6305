-- Function EXECUTE allowlist. Postgres grants EXECUTE to PUBLIC on every new function, and
-- Supabase adds anon/authenticated; revoke all of that for our functions in `public`, then grant
-- back exactly what clients may call. supabase/tests/database/090_grants.test.sql fails if a
-- function becomes callable by anon/authenticated without being listed here.
--
-- Future migrations that add functions must revoke from public/anon/authenticated and grant
-- explicitly in the same way.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Guests and signed-in users.
grant execute on function public.environment_latest(double precision, double precision) to anon, authenticated;
grant execute on function public.environment_glance() to anon, authenticated;
grant execute on function public.register_push_token(text, text) to anon, authenticated;
grant execute on function public.unregister_push_token(text) to anon, authenticated;
grant execute on function public.public_blight_reports_near(double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.haversine_km(double precision, double precision, double precision, double precision) to anon, authenticated;

-- Signed-in users. (Admin RPCs check is_admin() themselves.)
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.nearby_blight_reports(public.blight_category, double precision, double precision) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_status(uuid, public.account_status, timestamptz) to authenticated;
grant execute on function public.admin_summary() to authenticated;
grant execute on function public.admin_add_environment_reading(public.environment_category, public.environment_level, text, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.export_blight_reports() to authenticated;
grant execute on function public.export_housing_inquiries() to authenticated;

-- Used inside RLS policies on storage.objects / blight_report_photos (policies run as the caller).
grant execute on function public.can_upload_blight_photo(text) to authenticated;
grant execute on function public.can_read_blight_photo_object(text) to authenticated;
grant execute on function public.can_attach_blight_photo(bigint, text) to authenticated;
grant execute on function public.can_upload_inquiry_attachment(text) to authenticated;
grant execute on function public.can_read_inquiry_attachment(text) to authenticated;

-- Pure helpers called by invoker-rights triggers on client writes.
grant execute on function public.clean_text(text) to authenticated;
grant execute on function public.iso_utc(timestamptz) to authenticated;
grant execute on function public.default_remind_at(timestamptz, timestamptz) to authenticated;
