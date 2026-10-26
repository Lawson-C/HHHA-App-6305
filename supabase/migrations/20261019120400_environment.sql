-- Environmental readings cache (NWS, AirNow, admin-entered water/mosquito) and the public
-- read functions whose JSON matches the app's EnvironmentReading / EnvironmentGlance types.

create type public.environment_category as enum (
  'temperature', 'air_quality', 'water_quality', 'mosquito', 'heat'
);
create type public.environment_level as enum (
  'good', 'moderate', 'unhealthy_sensitive', 'unhealthy', 'very_unhealthy', 'hazardous', 'unknown'
);

create table public.environment_readings (
  id bigint generated always as identity primary key,
  category public.environment_category not null,
  value numeric,
  unit text,
  level public.environment_level not null default 'unknown',
  summary text not null default '',
  -- From the source, not fetch time.
  observed_at timestamptz not null,
  -- Display name, e.g. 'National Weather Service', 'AirNow (EPA)'.
  source text,
  -- Where the reading applies (station/grid), never a user's location.
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  -- Original payload. Private: never returned to clients.
  raw jsonb,
  created_at timestamptz not null default now(),
  constraint environment_readings_dedupe_key unique (category, source, observed_at)
);
create index environment_readings_latest_idx on public.environment_readings (category, observed_at desc, id desc);

alter table public.environment_readings enable row level security;
revoke all on table public.environment_readings from anon, authenticated;
grant all on table public.environment_readings to service_role;
-- No client policies: reads go through environment_latest() / environment_glance().

-- Stale thresholds (docs/integrations.md): AQI, temperature and heat 3 h, others 7 days.
create function public.environment_stale_after(p_category public.environment_category)
returns interval
language sql immutable
set search_path = ''
as $$
  select case
    when p_category in ('temperature', 'heat', 'air_quality') then interval '3 hours'
    else interval '7 days'
  end
$$;

-- Latest reading for a category, preferring readings within 25 km of the point when given.
create function public.environment_latest_reading(
  p_category public.environment_category,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.environment_readings
language sql stable
set search_path = ''
as $$
  select r.*
  from public.environment_readings r
  where r.category = p_category
  order by
    case
      when p_lat is null or p_lng is null or r.latitude is null or r.longitude is null then 0
      when public.haversine_km(p_lat, p_lng, r.latitude::double precision, r.longitude::double precision) <= 25 then 0
      else 1
    end,
    r.observed_at desc,
    r.id desc
  limit 1
$$;

-- One EnvironmentReading object (camelCase, like the app type). A missing reading becomes
-- "Data not available" and stale.
create function public.environment_reading_json(
  p_category public.environment_category,
  p_reading public.environment_readings
)
returns jsonb
language sql stable
set search_path = ''
as $$
  select case
    when p_reading.id is null then jsonb_build_object(
      'category', p_category, 'value', null, 'unit', null, 'level', 'unknown',
      'summary', 'Data not available', 'observedAt', null, 'source', null, 'stale', true)
    else jsonb_build_object(
      'category', p_category,
      'value', p_reading.value,
      'unit', p_reading.unit,
      'level', p_reading.level,
      'summary', coalesce(p_reading.summary, ''),
      'observedAt', public.iso_utc(p_reading.observed_at),
      'source', p_reading.source,
      'stale', now() - p_reading.observed_at > public.environment_stale_after(p_category))
  end
$$;

-- Public: always all five categories, in enum order. lat/lng are optional and never stored.
create function public.environment_latest(
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (abs(p_lat) > 90 or abs(p_lng) > 180)) then
    raise exception 'p_lat/p_lng must be valid coordinates' using errcode = '22023';
  end if;
  return (
    select jsonb_agg(public.environment_reading_json(c.category, public.environment_latest_reading(c.category, p_lat, p_lng)) order by c.ord)
    from unnest(enum_range(null::public.environment_category)) with ordinality as c(category, ord)
  );
end
$$;

-- "Active" alerts for the home card: sent and either ending in the future, or with no end and
-- sent within the last 24 hours (backend countActiveAlerts).
create function public.active_alert_count()
returns integer
language sql stable security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.alert_deliveries d
  where d.ends_at > now()
     or (d.ends_at is null and d.sent_at >= now() - interval '24 hours')
$$;

-- Public: compact summary for the home "Your neighborhood" card (EnvironmentGlance).
create function public.environment_glance()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_temp public.environment_readings := public.environment_latest_reading('temperature');
  v_air public.environment_readings := public.environment_latest_reading('air_quality');
  v_temp_json jsonb := public.environment_reading_json('temperature', v_temp);
  v_extra jsonb := case when jsonb_typeof(v_temp.raw) = 'object' then v_temp.raw else '{}'::jsonb end;
  v_hourly jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('time', h ->> 'time', 'temperatureF', (h ->> 'temperatureF')::numeric) order by ord), '[]'::jsonb)
    into v_hourly
  from jsonb_array_elements(case when jsonb_typeof(v_extra -> 'hourly') = 'array' then v_extra -> 'hourly' else '[]'::jsonb end)
       with ordinality as e(h, ord)
  where jsonb_typeof(h -> 'time') = 'string'
    and jsonb_typeof(h -> 'temperatureF') = 'number';

  return jsonb_build_object(
    'temperatureF', v_temp_json -> 'value',
    'conditions', coalesce(nullif(v_extra -> 'conditions', 'null'::jsonb),
                           case when v_temp.id is null then 'null'::jsonb else v_temp_json -> 'summary' end),
    'highF', case when jsonb_typeof(v_extra -> 'highF') = 'number' then v_extra -> 'highF' else 'null'::jsonb end,
    'lowF', case when jsonb_typeof(v_extra -> 'lowF') = 'number' then v_extra -> 'lowF' else 'null'::jsonb end,
    'airQuality', case when v_air.id is null then 'null'::jsonb else public.environment_reading_json('air_quality', v_air) end,
    'activeAlerts', public.active_alert_count(),
    'hourly', v_hourly,
    'updatedAt', v_temp_json -> 'observedAt',
    'stale', v_temp_json -> 'stale'
  );
end
$$;

-- Readings are a cache: drop anything observed more than 30 days ago (sync-environment).
create function public.prune_environment_readings()
returns integer
language sql
set search_path = ''
as $$
  with gone as (
    delete from public.environment_readings where observed_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from gone
$$;

-- Admin-entered readings for categories with no automated source yet (Q-009: water quality,
-- mosquito). Logged.
create function public.admin_add_environment_reading(
  p_category public.environment_category,
  p_level public.environment_level,
  p_summary text,
  p_value numeric default null,
  p_unit text default null,
  p_source text default null,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.environment_readings;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if public.clean_text(p_summary) is null or char_length(p_summary) > 200 then
    raise exception 'summary is required (max 200 characters)' using errcode = '22023';
  end if;
  if p_observed_at is null or p_observed_at > now() + interval '5 minutes' then
    raise exception 'observed_at must not be in the future' using errcode = '22023';
  end if;
  insert into public.environment_readings (category, value, unit, level, summary, observed_at, source, raw)
  values (p_category, p_value, public.clean_text(p_unit), p_level, public.clean_text(p_summary), p_observed_at,
          public.clean_text(p_source), jsonb_build_object('enteredBy', auth.uid()))
  on conflict (category, source, observed_at) do update
    set value = excluded.value, unit = excluded.unit, level = excluded.level, summary = excluded.summary
  returning * into v_row;

  perform public.log_admin_action('environment_reading_added', 'environment_reading', v_row.id::text,
    jsonb_build_object('category', p_category, 'level', p_level, 'summary', v_row.summary));
  return public.environment_reading_json(p_category, v_row);
end
$$;
