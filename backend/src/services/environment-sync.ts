import type { Core } from '@strapi/strapi';
import { UID, dbq, docs } from '../utils/uids';

type Level =
  | 'good'
  | 'moderate'
  | 'unhealthy_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous'
  | 'unknown';

export type ReadingInput = {
  category: 'temperature' | 'air_quality' | 'water_quality' | 'mosquito' | 'heat';
  value: number | null;
  unit: string | null;
  level: Level;
  summary: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  raw?: unknown;
};

type FetchJson = (url: string, init?: RequestInit) => Promise<any>;

export const SOURCES = {
  airnow: {
    key: 'airnow',
    name: 'AirNow (EPA)',
    url: 'https://www.airnow.gov',
    categories: ['air_quality'],
  },
  nws: {
    key: 'nws',
    name: 'National Weather Service',
    url: 'https://www.weather.gov',
    categories: ['temperature', 'heat'],
  },
} as const;

const AQI_LEVELS: Level[] = [
  'good',
  'moderate',
  'unhealthy_sensitive',
  'unhealthy',
  'very_unhealthy',
  'hazardous',
];

export const aqiLevel = (aqi: number): Level => {
  if (!Number.isFinite(aqi) || aqi < 0) return 'unknown';
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'unhealthy_sensitive';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very_unhealthy';
  return 'hazardous';
};

/** NWS heat index bands: <80 °F fine, 80–90 caution, 90–103 extreme caution, 103–125 danger. */
export const heatLevel = (heatIndexF: number): Level => {
  if (!Number.isFinite(heatIndexF)) return 'unknown';
  if (heatIndexF < 80) return 'good';
  if (heatIndexF < 90) return 'moderate';
  if (heatIndexF < 103) return 'unhealthy_sensitive';
  if (heatIndexF < 125) return 'unhealthy';
  return 'very_unhealthy';
};

const LEVEL_LABEL: Record<Level, string> = {
  good: 'Good',
  moderate: 'Moderate',
  unhealthy_sensitive: 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  very_unhealthy: 'Very unhealthy',
  hazardous: 'Hazardous',
  unknown: 'Unknown',
};

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

/** AirNow "2026-10-12 " + hour 14 + "EDT" → ISO string. */
export function airnowObservedAt(date: string, hour: number, tz: string): string {
  const offsets: Record<string, string> = {
    EST: '-05:00',
    EDT: '-04:00',
    CST: '-06:00',
    CDT: '-05:00',
  };
  const day = String(date).trim();
  const hh = String(hour).padStart(2, '0');
  const parsed = new Date(`${day}T${hh}:00:00${offsets[String(tz).trim()] ?? 'Z'}`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** Current AQI (worst pollutant) near the point. */
export async function fetchAirNow(
  fetchJson: FetchJson,
  apiKey: string,
  lat: number,
  lng: number,
): Promise<ReadingInput[]> {
  const url =
    'https://www.airnowapi.org/aq/observation/latLong/current/' +
    `?format=application/json&latitude=${lat}&longitude=${lng}&distance=25&API_KEY=${encodeURIComponent(apiKey)}`;
  const observations: any[] = await fetchJson(url);
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('AirNow returned no observations');
  }
  const worst = observations.reduce((a, b) => (Number(b.AQI) > Number(a.AQI) ? b : a));
  const aqi = Number(worst.AQI);
  const categoryNumber = Number(worst.Category?.Number);
  const level =
    categoryNumber >= 1 && categoryNumber <= 6 ? AQI_LEVELS[categoryNumber - 1] : aqiLevel(aqi);
  return [
    {
      category: 'air_quality',
      value: aqi,
      unit: 'AQI',
      level,
      summary: worst.Category?.Name || LEVEL_LABEL[level],
      observedAt: airnowObservedAt(worst.DateObserved, worst.HourObserved, worst.LocalTimeZone),
      latitude: Number(worst.Latitude) || lat,
      longitude: Number(worst.Longitude) || lng,
      // Never include the request URL here: it carries the API key.
      raw: observations,
    },
  ];
}

/** Temperature (+ hourly forecast for the home card) and heat index / heat alerts from NWS. */
export async function fetchNws(
  fetchJson: FetchJson,
  lat: number,
  lng: number,
): Promise<ReadingInput[]> {
  const point = await fetchJson(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
  );
  const props = point?.properties ?? {};

  const hourly = props.forecastHourly ? await fetchJson(props.forecastHourly) : null;
  const periods: any[] = hourly?.properties?.periods ?? [];
  const next24 = periods.slice(0, 24);
  const temps = next24.map((p) => Number(p.temperature)).filter(Number.isFinite);

  let observation: any = null;
  if (props.observationStations) {
    try {
      const stations = await fetchJson(props.observationStations);
      const stationId = stations?.features?.[0]?.id;
      if (stationId)
        observation = (await fetchJson(`${stationId}/observations/latest`))?.properties;
    } catch {
      observation = null; // fall back to the forecast's current hour
    }
  }

  const alerts = await fetchJson(
    `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`,
  ).catch(() => null);
  const heatAlert = (alerts?.features ?? [])
    .map((feature: any) => feature.properties)
    .find((alert: any) => /heat/i.test(alert?.event ?? ''));

  const observedC = observation?.temperature?.value;
  const temperatureF =
    Number.isFinite(observedC) && observedC !== null
      ? cToF(observedC)
      : Number.isFinite(Number(periods[0]?.temperature))
        ? Number(periods[0].temperature)
        : null;
  if (temperatureF === null) throw new Error('NWS returned no temperature');

  const heatIndexC = observation?.heatIndex?.value;
  const heatIndexF =
    Number.isFinite(heatIndexC) && heatIndexC !== null ? cToF(heatIndexC) : temperatureF;
  let level = heatLevel(heatIndexF);
  if (heatAlert && AQI_LEVELS.indexOf(level) < AQI_LEVELS.indexOf('unhealthy')) level = 'unhealthy';

  const observedAt = observation?.timestamp ?? periods[0]?.startTime ?? new Date().toISOString();
  const conditions: string | null =
    observation?.textDescription || periods[0]?.shortForecast || null;

  return [
    {
      category: 'temperature',
      value: temperatureF,
      unit: '°F',
      level: heatLevel(temperatureF),
      summary: conditions ?? `${temperatureF}°F`,
      observedAt: new Date(observedAt).toISOString(),
      latitude: lat,
      longitude: lng,
      raw: {
        conditions,
        highF: temps.length ? Math.max(...temps) : null,
        lowF: temps.length ? Math.min(...temps) : null,
        hourly: next24.slice(0, 12).map((p) => ({
          time: new Date(p.startTime).toISOString(),
          temperatureF: Number(p.temperature),
        })),
      },
    },
    {
      category: 'heat',
      value: heatIndexF,
      unit: '°F',
      level,
      summary: heatAlert?.headline || heatAlert?.event || LEVEL_LABEL[level],
      observedAt: new Date(observedAt).toISOString(),
      latitude: lat,
      longitude: lng,
      raw: {
        heatIndexF,
        alert: heatAlert ? { event: heatAlert.event, ends: heatAlert.ends } : null,
      },
    },
  ];
}

async function ensureSource(def: (typeof SOURCES)[keyof typeof SOURCES]) {
  const existing = await docs(UID.environmentalSource).findFirst({ filters: { key: def.key } });
  if (existing) return existing;
  return docs(UID.environmentalSource).create({
    data: { key: def.key, name: def.name, url: def.url, categories: [...def.categories] },
  });
}

async function runSource(
  strapi: Core.Strapi,
  def: (typeof SOURCES)[keyof typeof SOURCES],
  fetcher: () => Promise<ReadingInput[]>,
) {
  const source = await ensureSource(def);
  try {
    const readings = await fetcher();
    for (const reading of readings) {
      await docs(UID.environmentalReading).create({
        data: { ...reading, source: source.documentId },
      });
    }
    await docs(UID.environmentalSource).update({
      documentId: source.documentId,
      data: { lastFetchedAt: new Date().toISOString(), lastError: null },
    });
    return readings.length;
  } catch (error) {
    // Keep the last good readings; the API reports them as stale once they age out.
    const message = (error as Error).message?.slice(0, 500) ?? 'Unknown error';
    strapi.log.warn(`Environment sync (${def.key}) failed: ${message}`);
    await docs(UID.environmentalSource).update({
      documentId: source.documentId,
      data: { lastFetchedAt: new Date().toISOString(), lastError: message },
    });
    return 0;
  }
}

const defaultFetchJson =
  (userAgent: string): FetchJson =>
  async (url, init) => {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/geo+json, application/json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    return response.json();
  };

/**
 * Cron task: AirNow runs only when AIRNOW_API_KEY is set; NWS only when
 * ENVIRONMENT_SYNC_ENABLED=true. Uses the District 3 centroid, never a user's location.
 */
export async function syncEnvironment(strapi: Core.Strapi, fetchJson?: FetchJson) {
  const settings = strapi.config.get('hhha.environment') as {
    syncEnabled: boolean;
    airnowApiKey: string;
    nwsUserAgent: string;
  };
  const { lat, lng } = strapi.config.get('hhha.district.centroid') as { lat: number; lng: number };
  const get = fetchJson ?? defaultFetchJson(settings.nwsUserAgent);
  const result: Record<string, number> = {};

  if (settings.airnowApiKey) {
    result.airnow = await runSource(strapi, SOURCES.airnow, () =>
      fetchAirNow(get, settings.airnowApiKey, lat, lng),
    );
  }
  if (settings.syncEnabled) {
    result.nws = await runSource(strapi, SOURCES.nws, () => fetchNws(get, lat, lng));
  }
  return result;
}

/** Daily: readings are a cache; drop anything older than 30 days. */
export async function pruneReadings(_strapi: Core.Strapi, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return dbq(UID.environmentalReading).deleteMany({ where: { observedAt: { $lt: cutoff } } });
}
