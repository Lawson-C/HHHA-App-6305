/**
 * NWS + AirNow fetchers (port of backend/src/services/environment-sync.ts). Pure apart from the
 * injected `fetchJson`, so they're unit-testable with canned payloads.
 */

export type Level =
  | 'good'
  | 'moderate'
  | 'unhealthy_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous'
  | 'unknown';

export type Category = 'temperature' | 'air_quality' | 'water_quality' | 'mosquito' | 'heat';

/** A row for public.environment_readings. */
export type ReadingRow = {
  category: Category;
  value: number | null;
  unit: string | null;
  level: Level;
  summary: string;
  observed_at: string;
  source: string;
  latitude: number;
  longitude: number;
  raw: unknown;
};

export type FetchJson = (url: string) => Promise<any>;

export const SOURCE_NAMES = {
  airnow: 'AirNow (EPA)',
  nws: 'National Weather Service',
} as const;

/** District 3 centroid (backend DISTRICT_CENTROID default). Readings are never per-user. */
export const DEFAULT_CENTROID = { lat: 33.759, lng: -84.425 };

export function parseCentroid(value: string | undefined | null) {
  const parts = String(value ?? '')
    .split(',')
    .map((part) => Number(part.trim()));
  return parts.length === 2 &&
    parts.every(Number.isFinite) &&
    Math.abs(parts[0]) <= 90 &&
    Math.abs(parts[1]) <= 180
    ? { lat: parts[0], lng: parts[1] }
    : DEFAULT_CENTROID;
}

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

export const LEVEL_LABEL: Record<Level, string> = {
  good: 'Good',
  moderate: 'Moderate',
  unhealthy_sensitive: 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  very_unhealthy: 'Very unhealthy',
  hazardous: 'Hazardous',
  unknown: 'Unknown',
};

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** AirNow "2026-10-12 " + hour 14 + "EDT" → ISO string. */
export function airnowObservedAt(date: string, hour: number, tz: string, now = new Date()): string {
  const offsets: Record<string, string> = {
    EST: '-05:00',
    EDT: '-04:00',
    CST: '-06:00',
    CDT: '-05:00',
  };
  const day = String(date).trim();
  const hh = String(hour).padStart(2, '0');
  const parsed = new Date(`${day}T${hh}:00:00${offsets[String(tz).trim()] ?? 'Z'}`);
  return Number.isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
}

/** Current AQI (worst pollutant) near the point. */
export async function fetchAirNow(
  fetchJson: FetchJson,
  apiKey: string,
  lat: number,
  lng: number,
): Promise<ReadingRow[]> {
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
      value: Number.isFinite(aqi) ? aqi : null,
      unit: 'AQI',
      level,
      summary: worst.Category?.Name || LEVEL_LABEL[level],
      observed_at: airnowObservedAt(worst.DateObserved, worst.HourObserved, worst.LocalTimeZone),
      source: SOURCE_NAMES.airnow,
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
): Promise<ReadingRow[]> {
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
  const temperatureF = finite(observedC)
    ? cToF(observedC)
    : Number.isFinite(Number(periods[0]?.temperature)) && periods[0]?.temperature !== null
      ? Number(periods[0].temperature)
      : null;
  if (temperatureF === null) throw new Error('NWS returned no temperature');

  const heatIndexC = observation?.heatIndex?.value;
  const heatIndexF = finite(heatIndexC) ? cToF(heatIndexC) : temperatureF;
  let level = heatLevel(heatIndexF);
  if (heatAlert && AQI_LEVELS.indexOf(level) < AQI_LEVELS.indexOf('unhealthy')) level = 'unhealthy';

  const observedAt = new Date(
    observation?.timestamp ?? periods[0]?.startTime ?? new Date().toISOString(),
  ).toISOString();
  const conditions: string | null =
    observation?.textDescription || periods[0]?.shortForecast || null;

  return [
    {
      category: 'temperature',
      value: temperatureF,
      unit: '°F',
      level: heatLevel(temperatureF),
      summary: conditions ?? `${temperatureF}°F`,
      observed_at: observedAt,
      source: SOURCE_NAMES.nws,
      latitude: lat,
      longitude: lng,
      // environment_glance() reads conditions/highF/lowF/hourly from here.
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
      observed_at: observedAt,
      source: SOURCE_NAMES.nws,
      latitude: lat,
      longitude: lng,
      raw: {
        heatIndexF,
        alert: heatAlert ? { event: heatAlert.event, ends: heatAlert.ends } : null,
      },
    },
  ];
}

/** fetch wrapper for the real APIs: NWS requires a User-Agent with contact info. */
export const makeFetchJson =
  (fetchImpl: typeof fetch, userAgent: string, timeoutMs = 15000): FetchJson =>
  async (url) => {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/geo+json, application/json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    return response.json();
  };
