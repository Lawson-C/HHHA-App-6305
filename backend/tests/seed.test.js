'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
let seed;
beforeAll(async () => {
  t = await createContext();
  ({ seed } = require('../scripts/seed.js'));
});
afterAll(async () => {
  await t?.close();
});

describe('npm run seed', () => {
  it('is idempotent and fills every public screen', async () => {
    const first = await seed(t.strapi);
    expect(first.event.created).toBeGreaterThanOrEqual(10);
    const second = await seed(t.strapi);
    expect(second.event).toEqual({ created: 0, updated: first.event.created });
    expect(second['blight-report'].created).toBe(0);
    expect(second['environmental-reading'].created).toBe(0);

    const alerts = await t.request.get('/api/notifications');
    expect(alerts.body.data[0]).toMatchObject({
      title: 'Boil water advisory',
      category: 'emergency',
    });
    expect(alerts.body.data[0].actionSteps).toHaveLength(3);

    const events = await t.request.get('/api/events?pagination[pageSize]=100');
    const budgeting = events.body.data.find((e) => e.title === 'Budgeting basics workshop');
    expect(budgeting).toMatchObject({
      costLabel: 'Free',
      costNote: 'Dinner and childcare provided',
      eventType: 'financial_literacy',
    });
    expect(new Set(events.body.data.map((e) => e.eventType)).size).toBe(6);

    const housing = await t.request.get('/api/housing-resources');
    expect(new Set(housing.body.data.map((r) => r.category)).size).toBe(5);
    expect((await t.request.get('/api/housing-listings')).body.data).toHaveLength(3);
    const library = await t.request.get('/api/library-resources');
    expect(library.body.data[0]).toMatchObject({
      title: 'Your guide to the Hunter Hills app',
      featured: true,
    });

    const blight = await t.request.get('/api/blight-reports');
    expect(blight.body.data).toHaveLength(3); // the resolved one is hidden
    expect(blight.body.data.every((r) => !('reporter' in r))).toBe(true);

    const glance = await t.request.get('/api/environment/glance');
    expect(glance.body.data).toMatchObject({
      temperatureF: 78,
      highF: 84,
      lowF: 69,
      activeAlerts: 3,
      stale: false,
    });
    expect(glance.body.data.airQuality).toMatchObject({ value: 42, level: 'good' });
    const env = await t.request.get('/api/environment');
    expect(env.body.data.find((r) => r.category === 'water_quality')).toMatchObject({
      summary: 'Boil before use',
      stale: false,
    });

    const profile = await t.strapi.db
      .query(UID.profile)
      .findOne({ where: { fullName: 'Denise Carter' } });
    expect(profile).toMatchObject({ neighborhood: 'english_avenue', role: 'resident' });
  });
});
