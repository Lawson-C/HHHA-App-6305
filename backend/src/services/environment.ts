import { UID, docs } from '../utils/uids';

export const CATEGORIES = [
  'temperature',
  'air_quality',
  'water_quality',
  'mosquito',
  'heat',
] as const;

const HOUR = 60 * 60 * 1000;
/** Stale thresholds (docs/integrations.md): AQI and weather 3 h, everything else 7 days. */
export const STALE_AFTER_MS: Record<string, number> = {
  temperature: 3 * HOUR,
  heat: 3 * HOUR,
  air_quality: 3 * HOUR,
  water_quality: 7 * 24 * HOUR,
  mosquito: 7 * 24 * HOUR,
};

const NEAR_KM = 25;

export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const isStale = (category: string, observedAt: string | null, now = new Date()) =>
  !observedAt ||
  now.getTime() - new Date(observedAt).getTime() > (STALE_AFTER_MS[category] ?? 3 * HOUR);

const num = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);

export function toPublicReading(reading: any, category: string, now = new Date()) {
  if (!reading) {
    return {
      category,
      value: null,
      unit: null,
      level: 'unknown',
      summary: 'Data not available',
      observedAt: null,
      source: null,
      stale: true,
    };
  }
  return {
    category,
    value: num(reading.value),
    unit: reading.unit ?? null,
    level: reading.level ?? 'unknown',
    summary: reading.summary ?? '',
    observedAt: reading.observedAt ?? null,
    source: reading.source?.name ?? null,
    stale: isStale(category, reading.observedAt ?? null, now),
  };
}

/** Latest reading for one category, preferring readings within 25 km of the point. */
async function latestReading(category: string, point?: { lat: number; lng: number }) {
  const candidates = await docs(UID.environmentalReading).findMany({
    filters: { category },
    sort: [{ observedAt: 'desc' }, { id: 'desc' }],
    populate: { source: { fields: ['name', 'key'] } },
    limit: point ? 20 : 1,
  });
  if (!point) return candidates[0] ?? null;
  const near = candidates.find(
    (reading: any) =>
      reading.latitude === null ||
      reading.latitude === undefined ||
      haversineKm(point.lat, point.lng, Number(reading.latitude), Number(reading.longitude)) <=
        NEAR_KM,
  );
  return near ?? candidates[0] ?? null;
}

/** One entry per category, always all five (missing → "Data not available", stale). */
export async function currentConditions(point?: { lat: number; lng: number }, now = new Date()) {
  const readings = await Promise.all(CATEGORIES.map((category) => latestReading(category, point)));
  return {
    entries: CATEGORIES.map((category, index) => toPublicReading(readings[index], category, now)),
    raw: Object.fromEntries(CATEGORIES.map((category, index) => [category, readings[index]])),
  };
}

/**
 * Alerts that count as "active" on the home card: sent, not ended, and either with a future
 * `endsAt` or sent within the last 24 hours.
 */
export async function countActiveAlerts(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * HOUR).toISOString();
  return docs(UID.notification).count({
    filters: {
      sentAt: { $notNull: true },
      $or: [
        { endsAt: { $gt: now.toISOString() } },
        { endsAt: { $null: true }, sentAt: { $gte: dayAgo } },
      ],
    },
  });
}

export async function glance(now = new Date()) {
  const { entries, raw } = await currentConditions(undefined, now);
  const temperature = entries.find((entry) => entry.category === 'temperature')!;
  const air = entries.find((entry) => entry.category === 'air_quality')!;
  const extra = (raw.temperature?.raw ?? {}) as Record<string, any>;
  const hourly = Array.isArray(extra.hourly)
    ? extra.hourly
        .filter(
          (h: any) => h && typeof h.time === 'string' && Number.isFinite(Number(h.temperatureF)),
        )
        .map((h: any) => ({ time: h.time, temperatureF: Number(h.temperatureF) }))
    : [];

  return {
    temperatureF: temperature.value,
    conditions:
      (extra.conditions as string | undefined) ?? (raw.temperature ? temperature.summary : null),
    highF:
      Number.isFinite(Number(extra.highF)) && extra.highF !== null ? Number(extra.highF) : null,
    lowF: Number.isFinite(Number(extra.lowF)) && extra.lowF !== null ? Number(extra.lowF) : null,
    airQuality: raw.air_quality ? air : null,
    activeAlerts: await countActiveAlerts(now),
    hourly,
    updatedAt: temperature.observedAt,
    stale: temperature.stale,
  };
}
