-- Push tokens (guests too), alert recipients/idempotency, environment read functions.
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


-- ---- fixtures --------------------------------------------------------------------------------
select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'alice@example.test', '{"full_name": "Alice"}');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'bob@example.test', '{"full_name": "Bob"}');
select tests.create_user('ad000000-0000-4000-8000-0000000000ad', 'admin@example.test', '{"full_name": "Ada Admin"}');
select tests.create_user('ba000000-0000-4000-8000-0000000000ba', 'banned@example.test', '{"full_name": "Banned"}');
update public.profiles set role = 'admin' where id = 'ad000000-0000-4000-8000-0000000000ad';
update public.profiles set status = 'banned' where id = 'ba000000-0000-4000-8000-0000000000ba';
update public.profiles set notif_health_warnings = false where id = 'b0000000-0000-4000-8000-00000000000b';

-- ===============================================================================================
-- Push tokens
-- ===============================================================================================
select tests.login_anon();
select is((public.register_push_token('ExponentPushToken[guest-device]', 'android')) ->> 'linkedToProfile', 'false',
  'a guest registers a device (emergency alerts, Q-005)');
select is((public.register_push_token('ExponentPushToken[guest-device]', 'android')) ->> 'created', 'false',
  're-registering refreshes instead of duplicating');
select throws_ok($$select public.register_push_token('not-a-token', 'ios')$$, '22023', null, 'malformed tokens are rejected');
select throws_ok($$select public.register_push_token('ExponentPushToken[x]', 'windows')$$, '22023', null, 'unknown platforms are rejected');
select throws_ok($$select * from public.push_tokens$$, '42501', null, 'guests cannot read push tokens');
select throws_ok($$insert into public.push_tokens (token, platform) values ('ExponentPushToken[y]', 'ios')$$, '42501', null,
  'guests cannot write the table directly');

select tests.login('a0000000-0000-4000-8000-00000000000a');
select is((public.register_push_token('ExponentPushToken[alice-phone]', 'ios')) ->> 'linkedToProfile', 'true',
  'a signed-in resident registers a linked token');
select is((public.register_push_token('ExponentPushToken[guest-device]', 'android')) ->> 'linkedToProfile', 'true',
  'signing in on the guest device links its token');
select throws_ok($$select * from public.push_tokens$$, '42501', null, 'residents cannot read push tokens');
select throws_ok($$delete from public.push_tokens$$, '42501', null, 'residents cannot delete tokens directly');
select tests.login('b0000000-0000-4000-8000-00000000000b');
select lives_ok($$select public.register_push_token('ExponentPushToken[bob-phone]', 'android')$$, 'Bob registers');
select tests.login('ba000000-0000-4000-8000-0000000000ba');
select lives_ok($$select public.register_push_token('ExponentPushToken[banned-phone]', 'ios')$$, 'a banned user''s device can register');
select tests.logout();
reset role;

select is((select user_id from public.push_tokens where token = 'ExponentPushToken[guest-device]'),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'the guest token is now linked to Alice');

-- Recipient selection (send-alert).
select ok((select array_agg(t) from public.alert_recipient_tokens('emergency') t)
          @> array['ExponentPushToken[guest-device]', 'ExponentPushToken[alice-phone]', 'ExponentPushToken[bob-phone]', 'ExponentPushToken[banned-phone]'],
  'emergency goes to every device, guests and blocked accounts included');
select ok(not exists (select 1 from public.alert_recipient_tokens('health_warning') t where t = 'ExponentPushToken[bob-phone]'),
  'health warnings skip users who turned them off');
select ok(not exists (select 1 from public.alert_recipient_tokens('community_announcement') t where t = 'ExponentPushToken[banned-phone]'),
  'non-emergency alerts skip blocked accounts');
select ok(exists (select 1 from public.alert_recipient_tokens('community_announcement') t where t = 'ExponentPushToken[bob-phone]'),
  'community announcements reach opted-in residents');

-- Sign-out: the app re-registers as a guest, then unregisters when permission is revoked.
select tests.login_anon();
select is((public.register_push_token('ExponentPushToken[guest-device]', 'android')) ->> 'linkedToProfile', 'false',
  'registering as a guest unlinks the token');
select lives_ok($$select public.unregister_push_token('ExponentPushToken[guest-device]')$$, 'a guest unregisters');
select lives_ok($$select public.unregister_push_token('ExponentPushToken[guest-device]')$$, 'unregister is idempotent');
select throws_ok($$select public.alert_recipient_tokens('emergency')$$, '42501', null, 'clients cannot list recipients');
select tests.logout();
reset role;
select is((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[guest-device]'), 0, 'token removed');
select is(public.delete_push_tokens(array['ExponentPushToken[bob-phone]', 'ExponentPushToken[nope]']), 1,
  'delete_push_tokens removes DeviceNotRegistered tokens');

-- ===============================================================================================
-- Alert deliveries (idempotency)
-- ===============================================================================================
select is(public.claim_alert_delivery('test-alert-1', 'emergency', 'Boil water', now() + interval '1 day'), true,
  'first delivery of an alert is claimed');
select is(public.claim_alert_delivery('test-alert-1', 'emergency', 'Boil water (updated)', null), false,
  'a re-published alert is not delivered again');
select is((select title from public.alert_deliveries where alert_id = 'test-alert-1'), 'Boil water (updated)',
  'but its title/end are refreshed');
select lives_ok($$select public.finish_alert_delivery('test-alert-1', 4, 4, 0, true)$$, 'delivery recorded');
select is((select count(*)::int from public.admin_activity_log where action = 'notification_sent' and target_id = 'test-alert-1'), 1,
  'alert sends are logged');
select tests.login('a0000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.alert_deliveries), 0, 'residents cannot see delivery records');
select throws_ok($$select public.claim_alert_delivery('x', 'emergency', 't')$$, '42501', null, 'clients cannot claim deliveries');
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select is((select recipient_count from public.alert_deliveries where alert_id = 'test-alert-1'), 4, 'admins can see delivery records');
select tests.logout();
reset role;

-- ===============================================================================================
-- Environment
-- ===============================================================================================
-- Start from an empty cache inside this transaction.
delete from public.environment_readings;
delete from public.alert_deliveries;

select tests.login_anon();
select is(jsonb_array_length(public.environment_latest()), 5, 'always all five categories');
select is(public.environment_latest() -> 0, jsonb_build_object(
    'category', 'temperature', 'value', null, 'unit', null, 'level', 'unknown',
    'summary', 'Data not available', 'observedAt', null, 'source', null, 'stale', true),
  'missing data → "Data not available", stale');
select is((select array_agg(e ->> 'category') from jsonb_array_elements(public.environment_latest()) e),
  array['temperature', 'air_quality', 'water_quality', 'mosquito', 'heat'], 'categories in a stable order');
select is(public.environment_glance() -> 'airQuality', 'null'::jsonb, 'glance: no AQI reading → airQuality null');
select is((public.environment_glance() ->> 'activeAlerts')::int, 0, 'glance: no active alerts');
select throws_ok($$select count(*) from public.environment_readings$$, '42501', null, 'guests cannot read the raw cache');
select throws_ok($$select public.environment_latest(33.7, null)$$, '22023', null, 'lat without lng is rejected');
select tests.logout();
reset role;

insert into public.environment_readings (category, value, unit, level, summary, observed_at, source, latitude, longitude, raw)
values
  ('temperature', 78, '°F', 'good', 'Partly cloudy', now() - interval '10 minutes', 'National Weather Service', 33.759, -84.425,
   '{"conditions": "Partly cloudy", "highF": 84, "lowF": 69, "hourly": [{"time": "2026-10-19T20:00:00.000Z", "temperatureF": 78}, {"time": "bad"}], "secret": "x"}'),
  ('temperature', 60, '°F', 'good', 'Old', now() - interval '1 day', 'National Weather Service', 33.759, -84.425, null),
  ('air_quality', 42, 'AQI', 'good', 'Good', now() - interval '4 hours', 'AirNow (EPA)', 33.759, -84.425, '{"private": true}'),
  ('water_quality', null, null, 'unhealthy', 'Boil before use', now() - interval '2 days', 'Atlanta Watershed Mgmt.', null, null, null),
  ('mosquito', null, null, 'good', 'Low', now() - interval '8 days', 'Fulton County Health', null, null, null);
insert into public.alert_deliveries (alert_id, category, title, ends_at, sent_at) values
  ('active-1', 'emergency', 'Ends later', now() + interval '1 day', now() - interval '3 days'),
  ('active-2', 'health_warning', 'No end, recent', null, now() - interval '1 hour'),
  ('ended', 'health_warning', 'Ended', now() - interval '1 hour', now() - interval '2 days'),
  ('old', 'community_announcement', 'No end, old', null, now() - interval '2 days');

select tests.login('a0000000-0000-4000-8000-00000000000a');
select is((select e from jsonb_array_elements(public.environment_latest()) e where e ->> 'category' = 'temperature') - 'observedAt',
  jsonb_build_object('category', 'temperature', 'value', 78, 'unit', '°F', 'level', 'good', 'summary', 'Partly cloudy',
                     'source', 'National Weather Service', 'stale', false),
  'latest temperature reading, fresh');
select is((select (e ->> 'stale')::boolean from jsonb_array_elements(public.environment_latest()) e where e ->> 'category' = 'air_quality'),
  true, 'AQI older than 3 h is stale');
select is((select (e ->> 'stale')::boolean from jsonb_array_elements(public.environment_latest()) e where e ->> 'category' = 'water_quality'),
  false, 'water quality is fresh for 7 days');
select is((select (e ->> 'stale')::boolean from jsonb_array_elements(public.environment_latest()) e where e ->> 'category' = 'mosquito'),
  true, 'mosquito older than 7 days is stale');
select ok(public.environment_latest()::text !~ 'secret|private', 'raw payloads never leak');
select ok((select (e ->> 'observedAt') ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
           from jsonb_array_elements(public.environment_latest()) e where e ->> 'category' = 'temperature'),
  'observedAt is ISO-8601 UTC');
select is(jsonb_array_length(public.environment_latest(33.76, -84.42)), 5, 'lat/lng variant works');

select is(public.environment_glance() - 'updatedAt' - 'airQuality', jsonb_build_object(
    'temperatureF', 78, 'conditions', 'Partly cloudy', 'highF', 84, 'lowF', 69, 'activeAlerts', 2,
    'hourly', jsonb_build_array(jsonb_build_object('time', '2026-10-19T20:00:00.000Z', 'temperatureF', 78)),
    'stale', false),
  'glance matches EnvironmentGlance (bad hourly entries dropped; 2 active alerts)');
select is(public.environment_glance() -> 'airQuality' ->> 'category', 'air_quality', 'glance includes the AQI reading');

select throws_ok($$select public.admin_add_environment_reading('mosquito', 'moderate', 'Moderate')$$, '42501', null,
  'residents cannot add readings');
select tests.login('ad000000-0000-4000-8000-0000000000ad');
select is(public.admin_add_environment_reading('mosquito', 'moderate', 'Moderate', null, null, 'Fulton County Health') ->> 'summary',
  'Moderate', 'admins add a manual reading (Q-009)');
select is((select e ->> 'level' from jsonb_array_elements(public.environment_latest()) e where e ->> 'category' = 'mosquito'),
  'moderate', 'the manual reading is now the latest');
select is((select count(*)::int from public.admin_activity_log where action = 'environment_reading_added'
           and actor_id = 'ad000000-0000-4000-8000-0000000000ad'), 1, 'manual readings are logged');
select tests.logout();
reset role;

insert into public.environment_readings (category, level, summary, observed_at, source)
values ('heat', 'good', 'Ancient', now() - interval '31 days', 'National Weather Service');
select is(public.prune_environment_readings(), 1, 'readings older than 30 days are pruned');

select * from finish();
rollback;
