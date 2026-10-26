-- Local development seed (runs on `npx supabase db reset`). No auth users here: resident demo
-- data needs real accounts, see supabase/scripts/seed-demo.ts.
--
-- Environmental readings matching the backend's seed, observed "just now" so nothing is stale.
insert into public.environment_readings (category, value, unit, level, summary, observed_at, source, latitude, longitude, raw)
values
  ('temperature', 78, '°F', 'good', 'Partly cloudy', now() - interval '3 minutes', 'National Weather Service', 33.759, -84.425,
   jsonb_build_object(
     'seeded', true,
     'conditions', 'Partly cloudy',
     'highF', 84,
     'lowF', 69,
     'hourly', (
       select jsonb_agg(jsonb_build_object(
                'time', public.iso_utc(date_trunc('hour', now()) + (i - 1) * interval '1 hour'),
                'temperatureF', t) order by i)
       from unnest(array[78, 81, 83, 82, 79]) with ordinality as h(t, i)
     ))),
  ('air_quality', 42, 'AQI', 'good', 'Good', now() - interval '3 minutes', 'AirNow (EPA)', 33.759, -84.425, '{"seeded": true}'),
  ('water_quality', null, null, 'unhealthy', 'Boil before use', now() - interval '10 minutes', 'Atlanta Watershed Mgmt.', 33.759, -84.425, '{"seeded": true}'),
  ('mosquito', null, null, 'good', 'Low', now() - interval '1 day', 'Fulton County Health', 33.759, -84.425, '{"seeded": true}'),
  ('heat', 88, '°F', 'moderate', 'Moderate', now() - interval '3 minutes', 'National Weather Service', 33.759, -84.425, '{"seeded": true}')
on conflict (category, source, observed_at) do nothing;
