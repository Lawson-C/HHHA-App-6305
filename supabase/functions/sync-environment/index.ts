/**
 * sync-environment: pg_cron every 30 minutes (x-cron-secret). For the District 3 centroid
 * (DISTRICT_CENTROID, default 33.759,-84.425 — never a user's location):
 * - NWS temperature (+ conditions, high/low, 12-hour forecast) and heat, when NWS_USER_AGENT
 *   is set (NWS requires a contact in the User-Agent);
 * - AirNow AQI (worst pollutant), when AIRNOW_API_KEY is set.
 * A failing source keeps its last good readings (they turn stale). Then prunes readings older
 * than 30 days.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  fetchAirNow,
  fetchNws,
  makeFetchJson,
  parseCentroid,
  type ReadingRow,
} from '../_shared/environment.ts';
import { isCronAuthorized, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (!isCronAuthorized(req, Deno.env.get('CRON_SECRET')))
    return json(401, { error: 'Unauthorized' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { lat, lng } = parseCentroid(Deno.env.get('DISTRICT_CENTROID'));
  const userAgent = Deno.env.get('NWS_USER_AGENT') ?? '';
  const airnowKey = Deno.env.get('AIRNOW_API_KEY') ?? '';
  const fetchJson = makeFetchJson(fetch, userAgent || 'HistoricHunterHillsApp');

  const result: Record<string, number | string> = {};
  const run = async (name: string, fetcher: () => Promise<ReadingRow[]>) => {
    try {
      const rows = await fetcher();
      const { error } = await supabase
        .from('environment_readings')
        .upsert(rows, { onConflict: 'category,source,observed_at' });
      if (error) throw new Error(error.message);
      result[name] = rows.length;
    } catch (error) {
      // Never log the request URL: the AirNow one carries the API key.
      const message = (error as Error).message?.slice(0, 300) ?? 'Unknown error';
      console.warn(`Environment sync (${name}) failed: ${message}`);
      result[name] = `error: ${message}`;
    }
  };

  if (userAgent) await run('nws', () => fetchNws(fetchJson, lat, lng));
  if (airnowKey) await run('airnow', () => fetchAirNow(fetchJson, airnowKey, lat, lng));

  const { data: pruned, error: pruneError } = await supabase.rpc('prune_environment_readings');
  if (pruneError) console.warn('prune_environment_readings failed', pruneError.message);
  result.pruned = Number(pruned ?? 0);

  return json(200, result);
});
