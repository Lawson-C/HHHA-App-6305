'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
let sync;
beforeAll(async () => {
  t = await createContext();
  sync = require('../dist/src/services/environment-sync.js');
});
afterAll(async () => {
  await t?.close();
});

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

async function source(key, name) {
  return t.strapi.documents(UID.environmentalSource).create({ data: { key, name } });
}

describe('GET /api/environment', () => {
  it('always returns all five categories; missing ones are "Data not available" and stale', async () => {
    const res = await t.request.get('/api/environment');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.category).sort()).toEqual([
      'air_quality',
      'heat',
      'mosquito',
      'temperature',
      'water_quality',
    ]);
    for (const entry of res.body.data) {
      expect(entry).toEqual({
        category: entry.category,
        value: null,
        unit: null,
        level: 'unknown',
        summary: 'Data not available',
        observedAt: null,
        source: null,
        stale: true,
      });
    }
  });

  it('returns the latest reading per category with stale flags (AQI 3 h, others 7 days)', async () => {
    const airnow = await source('airnow', 'AirNow (EPA)');
    const health = await source('fulton-health', 'Fulton County Health');
    const create = (data) => t.strapi.documents(UID.environmentalReading).create({ data });
    await create({
      source: airnow.documentId,
      category: 'air_quality',
      value: 80,
      unit: 'AQI',
      level: 'moderate',
      summary: 'Moderate',
      observedAt: minutesAgo(600),
      latitude: 33.759,
      longitude: -84.425,
    });
    await create({
      source: airnow.documentId,
      category: 'air_quality',
      value: 42,
      unit: 'AQI',
      level: 'good',
      summary: 'Good',
      observedAt: minutesAgo(3),
      latitude: 33.759,
      longitude: -84.425,
      raw: { secret: true },
    });
    await create({
      source: health.documentId,
      category: 'mosquito',
      level: 'good',
      summary: 'Low',
      observedAt: minutesAgo(60 * 24),
    });
    await create({
      source: health.documentId,
      category: 'water_quality',
      level: 'unhealthy',
      summary: 'Boil before use',
      observedAt: minutesAgo(60 * 24 * 8),
    });

    for (const who of [null, await t.makeUser()]) {
      const res = await t.as(who).get('/api/environment?lat=33.7601&lng=-84.4231');
      expect(res.status).toBe(200);
      const byCategory = Object.fromEntries(res.body.data.map((r) => [r.category, r]));
      expect(byCategory.air_quality).toEqual({
        category: 'air_quality',
        value: 42,
        unit: 'AQI',
        level: 'good',
        summary: 'Good',
        observedAt: expect.any(String),
        source: 'AirNow (EPA)',
        stale: false,
      });
      expect(byCategory.mosquito).toMatchObject({ summary: 'Low', stale: false, value: null });
      expect(byCategory.water_quality).toMatchObject({ summary: 'Boil before use', stale: true });
      expect(JSON.stringify(res.body)).not.toContain('secret');
    }
  });

  it('400 for invalid coordinates', async () => {
    expect((await t.request.get('/api/environment?lat=abc&lng=1')).status).toBe(400);
  });
});

describe('GET /api/environment/glance', () => {
  it('summarizes temperature (+ hourly from the NWS cache), AQI and active alerts', async () => {
    const nws = await source('nws', 'National Weather Service');
    await t.strapi.documents(UID.environmentalReading).create({
      data: {
        source: nws.documentId,
        category: 'temperature',
        value: 78,
        unit: '°F',
        level: 'good',
        summary: 'Partly cloudy',
        observedAt: minutesAgo(3),
        raw: {
          conditions: 'Partly cloudy',
          highF: 84,
          lowF: 69,
          hourly: [
            { time: minutesAgo(0), temperatureF: 78 },
            { time: minutesAgo(-60), temperatureF: 81 },
          ],
        },
      },
    });
    const notification = (data) =>
      t.strapi
        .documents(UID.notification)
        .create({ data: { message: 'm', category: 'community_announcement', ...data } });
    await notification({ title: 'Recent', sentAt: minutesAgo(30) });
    await notification({ title: 'Old', sentAt: minutesAgo(60 * 72) });
    await notification({ title: 'Ongoing', sentAt: minutesAgo(60 * 72), endsAt: minutesAgo(-600) });
    await notification({ title: 'Ended', sentAt: minutesAgo(20), endsAt: minutesAgo(10) });
    await notification({ title: 'Unsent' });

    const res = await t.request.get('/api/environment/glance');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      temperatureF: 78,
      conditions: 'Partly cloudy',
      highF: 84,
      lowF: 69,
      airQuality: expect.objectContaining({ category: 'air_quality', value: 42, stale: false }),
      activeAlerts: 2,
      hourly: [
        { time: expect.any(String), temperatureF: 78 },
        { time: expect.any(String), temperatureF: 81 },
      ],
      updatedAt: expect.any(String),
      stale: false,
    });
  });
});

describe('environment sync (fetchers, no network)', () => {
  const airnowPayload = [
    {
      DateObserved: '2026-10-12 ',
      HourObserved: 14,
      LocalTimeZone: 'EDT',
      ReportingArea: 'Atlanta',
      Latitude: 33.65,
      Longitude: -84.43,
      ParameterName: 'O3',
      AQI: 42,
      Category: { Number: 1, Name: 'Good' },
    },
    {
      DateObserved: '2026-10-12 ',
      HourObserved: 14,
      LocalTimeZone: 'EDT',
      ReportingArea: 'Atlanta',
      Latitude: 33.65,
      Longitude: -84.43,
      ParameterName: 'PM2.5',
      AQI: 55,
      Category: { Number: 2, Name: 'Moderate' },
    },
  ];
  const now = new Date();
  const nwsResponses = {
    'https://api.weather.gov/points/33.7590,-84.4250': {
      properties: {
        forecastHourly: 'https://api.weather.gov/gridpoints/FFC/50,86/forecast/hourly',
        observationStations: 'https://api.weather.gov/gridpoints/FFC/50,86/stations',
      },
    },
    'https://api.weather.gov/gridpoints/FFC/50,86/forecast/hourly': {
      properties: {
        periods: Array.from({ length: 30 }, (_, i) => ({
          startTime: new Date(now.getTime() + i * 3600000).toISOString(),
          temperature: 70 + (i % 12),
          shortForecast: 'Sunny',
        })),
      },
    },
    'https://api.weather.gov/gridpoints/FFC/50,86/stations': {
      features: [{ id: 'https://api.weather.gov/stations/KATL' }],
    },
    'https://api.weather.gov/stations/KATL/observations/latest': {
      properties: {
        timestamp: now.toISOString(),
        textDescription: 'Partly Cloudy',
        temperature: { value: 30 },
        heatIndex: { value: 31.5 },
      },
    },
    'https://api.weather.gov/alerts/active?point=33.7590,-84.4250': { features: [] },
  };

  it('maps AirNow to the worst pollutant and NWS to temperature + heat readings', async () => {
    const calls = [];
    const fetchJson = async (url) => {
      calls.push(url);
      if (url.startsWith('https://www.airnowapi.org/')) return airnowPayload;
      if (!(url in nwsResponses)) throw new Error(`unexpected ${url}`);
      return nwsResponses[url];
    };
    t.strapi.config.set('hhha.environment.airnowApiKey', 'test-key');
    t.strapi.config.set('hhha.environment.syncEnabled', true);
    try {
      const result = await sync.syncEnvironment(t.strapi, fetchJson);
      expect(result).toEqual({ airnow: 1, nws: 2 });
    } finally {
      t.strapi.config.set('hhha.environment.airnowApiKey', '');
      t.strapi.config.set('hhha.environment.syncEnabled', false);
    }
    expect(calls[0]).toContain('latitude=33.759&longitude=-84.425');

    const aqi = await t.strapi.documents(UID.environmentalReading).findFirst({
      filters: { category: 'air_quality' },
      sort: [{ id: 'desc' }],
    });
    expect(aqi).toMatchObject({
      value: 55,
      level: 'moderate',
      summary: 'Moderate',
      observedAt: '2026-10-12T18:00:00.000Z',
    });

    const temp = await t.strapi
      .documents(UID.environmentalReading)
      .findFirst({ filters: { category: 'temperature' }, sort: [{ id: 'desc' }] });
    expect(temp).toMatchObject({ value: 86, unit: '°F', summary: 'Partly Cloudy' });
    expect(temp.raw).toMatchObject({ conditions: 'Partly Cloudy', highF: 81, lowF: 70 });
    expect(temp.raw.hourly).toHaveLength(12);
    const heat = await t.strapi
      .documents(UID.environmentalReading)
      .findFirst({ filters: { category: 'heat' }, sort: [{ id: 'desc' }] });
    expect(heat).toMatchObject({ value: 89, level: 'moderate' });

    const src = await t.strapi
      .documents(UID.environmentalSource)
      .findFirst({ filters: { key: 'airnow' } });
    expect(src.lastError).toBeNull();
    expect(src.lastFetchedAt).toEqual(expect.any(String));
  });

  it('on failure keeps old readings and records lastError', async () => {
    const before = await t.strapi.db.query(UID.environmentalReading).count();
    t.strapi.config.set('hhha.environment.syncEnabled', true);
    try {
      await sync.syncEnvironment(t.strapi, async () => {
        throw new Error('HTTP 503 from api.weather.gov');
      });
    } finally {
      t.strapi.config.set('hhha.environment.syncEnabled', false);
    }
    expect(await t.strapi.db.query(UID.environmentalReading).count()).toBe(before);
    const src = await t.strapi
      .documents(UID.environmentalSource)
      .findFirst({ filters: { key: 'nws' } });
    expect(src.lastError).toBe('HTTP 503 from api.weather.gov');
  });

  it('does nothing when no source is enabled', async () => {
    const fetchJson = jest.fn();
    expect(await sync.syncEnvironment(t.strapi, fetchJson)).toEqual({});
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('level helpers and pruning', async () => {
    expect(sync.aqiLevel(42)).toBe('good');
    expect(sync.aqiLevel(151)).toBe('unhealthy');
    expect(sync.heatLevel(88)).toBe('moderate');
    expect(sync.heatLevel(105)).toBe('unhealthy');
    await t.strapi.documents(UID.environmentalReading).create({
      data: {
        category: 'mosquito',
        level: 'good',
        summary: 'Old',
        observedAt: minutesAgo(60 * 24 * 40),
      },
    });
    await sync.pruneReadings(t.strapi);
    expect(
      await t.strapi.db.query(UID.environmentalReading).count({ where: { summary: 'Old' } }),
    ).toBe(0);
  });
});
