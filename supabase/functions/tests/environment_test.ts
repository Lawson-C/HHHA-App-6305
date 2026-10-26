import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  airnowObservedAt,
  aqiLevel,
  fetchAirNow,
  fetchNws,
  heatLevel,
  parseCentroid,
  type FetchJson,
} from '../_shared/environment.ts';

test('level helpers', () => {
  assert.equal(aqiLevel(42), 'good');
  assert.equal(aqiLevel(101), 'unhealthy_sensitive');
  assert.equal(aqiLevel(301), 'hazardous');
  assert.equal(aqiLevel(Number.NaN), 'unknown');
  assert.equal(heatLevel(79), 'good');
  assert.equal(heatLevel(88), 'moderate');
  assert.equal(heatLevel(100), 'unhealthy_sensitive');
  assert.equal(heatLevel(110), 'unhealthy');
  assert.equal(heatLevel(130), 'very_unhealthy');
});

test('parseCentroid falls back to District 3', () => {
  assert.deepEqual(parseCentroid('33.7,-84.4'), { lat: 33.7, lng: -84.4 });
  assert.deepEqual(parseCentroid(undefined), { lat: 33.759, lng: -84.425 });
  assert.deepEqual(parseCentroid('nope'), { lat: 33.759, lng: -84.425 });
});

test('airnowObservedAt converts local time', () => {
  assert.equal(airnowObservedAt('2026-10-12 ', 14, 'EDT'), '2026-10-12T18:00:00.000Z');
  assert.equal(airnowObservedAt('2026-01-12', 9, 'EST'), '2026-01-12T14:00:00.000Z');
});

test('fetchAirNow picks the worst pollutant and never stores the key', async () => {
  let requested = '';
  const fetchJson: FetchJson = async (url) => {
    requested = url;
    return [
      {
        AQI: 30,
        Category: { Number: 1, Name: 'Good' },
        DateObserved: '2026-10-12 ',
        HourObserved: 14,
        LocalTimeZone: 'EDT',
        Latitude: 33.76,
        Longitude: -84.42,
        ParameterName: 'PM2.5',
      },
      {
        AQI: 105,
        Category: { Number: 3, Name: 'Unhealthy for Sensitive Groups' },
        DateObserved: '2026-10-12 ',
        HourObserved: 14,
        LocalTimeZone: 'EDT',
        Latitude: 33.76,
        Longitude: -84.42,
        ParameterName: 'O3',
      },
    ];
  };
  const [reading] = await fetchAirNow(fetchJson, 'k&y', 33.759, -84.425);
  assert.match(requested, /API_KEY=k%26y/);
  assert.equal(reading.category, 'air_quality');
  assert.equal(reading.value, 105);
  assert.equal(reading.level, 'unhealthy_sensitive');
  assert.equal(reading.summary, 'Unhealthy for Sensitive Groups');
  assert.equal(reading.source, 'AirNow (EPA)');
  assert.equal(reading.observed_at, '2026-10-12T18:00:00.000Z');
  assert.ok(!JSON.stringify(reading.raw).includes('k&y'));
});

test('fetchAirNow throws on an empty response', async () => {
  await assert.rejects(
    fetchAirNow(async () => [], 'key', 1, 2),
    /no observations/,
  );
});

test('fetchNws maps observation + forecast to temperature and heat readings', async () => {
  const periods = Array.from({ length: 24 }, (_, i) => ({
    startTime: new Date(Date.UTC(2026, 9, 12, 20 + i)).toISOString(),
    temperature: 70 + (i % 10),
    shortForecast: 'Partly Cloudy',
  }));
  const responses: Record<string, unknown> = {
    'https://api.weather.gov/points/33.7590,-84.4250': {
      properties: {
        forecastHourly: 'https://nws/hourly',
        observationStations: 'https://nws/stations',
      },
    },
    'https://nws/hourly': { properties: { periods } },
    'https://nws/stations': { features: [{ id: 'https://nws/stations/KATL' }] },
    'https://nws/stations/KATL/observations/latest': {
      properties: {
        timestamp: '2026-10-12T20:51:00+00:00',
        textDescription: 'Mostly Sunny',
        temperature: { value: 30 },
        heatIndex: { value: 33 },
      },
    },
    'https://api.weather.gov/alerts/active?point=33.7590,-84.4250': {
      features: [
        { properties: { event: 'Heat Advisory', headline: 'Heat Advisory until 8 PM', ends: 'x' } },
      ],
    },
  };
  const fetchJson: FetchJson = async (url) => {
    if (!(url in responses)) throw new Error(`unexpected ${url}`);
    return responses[url];
  };
  const [temperature, heat] = await fetchNws(fetchJson, 33.759, -84.425);
  assert.equal(temperature.category, 'temperature');
  assert.equal(temperature.value, 86);
  assert.equal(temperature.summary, 'Mostly Sunny');
  assert.equal(temperature.observed_at, '2026-10-12T20:51:00.000Z');
  const raw = temperature.raw as {
    highF: number;
    lowF: number;
    hourly: unknown[];
    conditions: string;
  };
  assert.equal(raw.highF, 79);
  assert.equal(raw.lowF, 70);
  assert.equal(raw.hourly.length, 12);
  assert.equal(raw.conditions, 'Mostly Sunny');
  assert.equal(heat.category, 'heat');
  assert.equal(heat.value, 91);
  assert.equal(heat.level, 'unhealthy'); // heat alert raises the level
  assert.equal(heat.summary, 'Heat Advisory until 8 PM');
});

test('fetchNws falls back to the forecast when there is no observation', async () => {
  const fetchJson: FetchJson = async (url) => {
    if (url.startsWith('https://api.weather.gov/points/'))
      return { properties: { forecastHourly: 'h' } };
    if (url === 'h')
      return {
        properties: {
          periods: [{ startTime: '2026-10-12T20:00:00Z', temperature: 75, shortForecast: 'Sunny' }],
        },
      };
    return { features: [] };
  };
  const [temperature, heat] = await fetchNws(fetchJson, 33.759, -84.425);
  assert.equal(temperature.value, 75);
  assert.equal(temperature.summary, 'Sunny');
  assert.equal(heat.value, 75);
  assert.equal(heat.level, 'good');
});

test('fetchNws throws when there is no temperature at all', async () => {
  await assert.rejects(
    fetchNws(async () => ({ properties: {} }), 1, 2),
    /no temperature/,
  );
});
