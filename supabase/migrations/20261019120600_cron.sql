-- Schedules for the cron Edge Functions (pg_cron + pg_net).
--
-- Guarded: the jobs always exist, but they do nothing until two Vault secrets are created
-- (see supabase/README.md, "Cron"):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Fire-and-forget POST to an Edge Function, authenticated with the shared cron secret.
-- Returns the pg_net request id, or null when not configured.
create function public.invoke_edge_function(p_name text)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_name is null or p_name !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'invalid function name' using errcode = '22023';
  end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when undefined_table or invalid_schema_name or insufficient_privilege then
    return null;
  end;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('scheduledAt', public.iso_utc(now())),
    timeout_milliseconds := 30000
  );
end
$$;

-- cron.schedule() with an existing job name updates that job, so this is re-runnable.
select cron.schedule('hhha-send-reminders', '*/5 * * * *', $job$select public.invoke_edge_function('send-reminders')$job$);
select cron.schedule('hhha-sync-environment', '*/30 * * * *', $job$select public.invoke_edge_function('sync-environment')$job$);
