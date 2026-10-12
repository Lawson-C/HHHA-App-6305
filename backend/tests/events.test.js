'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
let resident;
let admin;
beforeAll(async () => {
  t = await createContext();
  resident = await t.makeUser();
  admin = await t.makeUser({ role: 'admin' });
});
afterAll(async () => {
  await t?.close();
});

const eventBody = {
  title: 'Budgeting basics workshop',
  description:
    'Learn a simple way to plan your monthly budget, cut down on fees, and build savings.',
  startsAt: '2026-10-24T22:00:00.000Z',
  endsAt: '2026-10-24T23:30:00.000Z',
  eventType: 'financial_literacy',
  locationName: 'Hunter Hills Community Center',
  address: '1100 Joseph E. Lowery Blvd NW, Atlanta, GA',
  costLabel: 'Free',
  costNote: 'Dinner and childcare provided',
};

describe('GET /api/events (public)', () => {
  let published;
  let draft;
  beforeAll(async () => {
    published = await t.makeEvent({ title: 'Published one', eventType: 'wellness' });
    draft = await t.makeEvent({ title: 'Draft one' }, { publish: false });
  });

  it.each([
    ['guest', () => null],
    ['resident', () => resident],
    ['admin', () => admin],
  ])('%s: 200, published events only, flat Strapi 5 shape', async (_label, who) => {
    const res = await t.as(who()).get('/api/events?pagination[pageSize]=100');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((e) => e.documentId);
    expect(ids).toContain(published.documentId);
    expect(ids).not.toContain(draft.documentId);
    expect(res.body.meta.pagination).toMatchObject({ page: 1, pageSize: 100 });
    expect(res.body.data[0]).not.toHaveProperty('attributes');
  });

  it('filters by eventType and startsAt range; sorted by startsAt', async () => {
    await t.makeEvent({
      title: 'Later',
      startsAt: new Date(Date.now() + 40 * 86400000).toISOString(),
    });
    const res = await t.request.get('/api/events?filters[eventType][$eq]=wellness');
    expect(res.body.data.every((e) => e.eventType === 'wellness')).toBe(true);
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 30 * 86400000).toISOString();
    const ranged = await t.request.get(
      `/api/events?filters[startsAt][$gte]=${from}&filters[startsAt][$lt]=${to}`,
    );
    expect(ranged.body.data.some((e) => e.title === 'Later')).toBe(false);
    const all = await t.request.get('/api/events');
    const starts = all.body.data.map((e) => e.startsAt);
    expect([...starts].sort()).toEqual(starts);
  });
});

describe('GET /api/events/:id', () => {
  it('guest: no hasReminder; signed in: hasReminder + reminderId', async () => {
    const event = await t.makeEvent();
    const guest = await t.request.get(`/api/events/${event.documentId}`);
    expect(guest.status).toBe(200);
    expect(guest.body.data).not.toHaveProperty('hasReminder');

    const before = await t.as(resident).get(`/api/events/${event.documentId}`);
    expect(before.body.data).toMatchObject({ hasReminder: false, reminderId: null });

    const created = await t
      .as(resident)
      .post('/api/event-reminders')
      .send({ data: { event: event.documentId } });
    expect(created.status).toBe(201);
    const after = await t.as(resident).get(`/api/events/${event.documentId}`);
    expect(after.body.data).toMatchObject({
      hasReminder: true,
      reminderId: created.body.data.documentId,
    });

    const otherUser = await t.makeUser();
    const others = await t.as(otherUser).get(`/api/events/${event.documentId}`);
    expect(others.body.data.hasReminder).toBe(false);
  });

  it('draft or unknown → 404', async () => {
    const draft = await t.makeEvent({}, { publish: false });
    expect((await t.request.get(`/api/events/${draft.documentId}`)).status).toBe(404);
    expect((await t.request.get('/api/events/nope')).status).toBe(404);
  });
});

describe('POST/PUT/DELETE /api/events (admin)', () => {
  it('guest 401, resident 403', async () => {
    expect((await t.request.post('/api/events').send({ data: eventBody })).status).toBe(401);
    expect((await t.as(resident).post('/api/events').send({ data: eventBody })).status).toBe(403);
    const event = await t.makeEvent();
    expect(
      (
        await t
          .as(resident)
          .put(`/api/events/${event.documentId}`)
          .send({ data: { title: 'x' } })
      ).status,
    ).toBe(403);
    expect((await t.as(resident).delete(`/api/events/${event.documentId}`)).status).toBe(403);
    expect((await t.request.delete(`/api/events/${event.documentId}`)).status).toBe(401);
  });

  it('admin creates (published), updates and deletes; each change is logged', async () => {
    const created = await t.as(admin).post('/api/events').send({ data: eventBody });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ...eventBody, publishedAt: expect.any(String) });
    const id = created.body.data.documentId;
    expect((await t.request.get(`/api/events/${id}`)).status).toBe(200);

    const updated = await t
      .as(admin)
      .put(`/api/events/${id}`)
      .send({ data: { title: 'Budgeting basics (moved)' } });
    expect(updated.status).toBe(200);
    expect((await t.request.get(`/api/events/${id}`)).body.data.title).toBe(
      'Budgeting basics (moved)',
    );

    await t
      .as(resident)
      .post('/api/event-reminders')
      .send({ data: { event: id } });
    expect(
      await t.strapi.db.query(UID.eventReminder).count({ where: { event: { documentId: id } } }),
    ).toBe(1);

    expect((await t.as(admin).delete(`/api/events/${id}`)).status).toBe(204);
    expect((await t.request.get(`/api/events/${id}`)).status).toBe(404);
    // Removing an event removes its reminders.
    expect(
      await t.strapi.db.query(UID.eventReminder).count({ where: { event: { documentId: id } } }),
    ).toBe(0);

    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({ where: { targetId: id }, orderBy: { id: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['event_created', 'event_updated', 'event_deleted']);
  });

  it('incomplete or inconsistent events are rejected with field errors', async () => {
    const missing = await t
      .as(admin)
      .post('/api/events')
      .send({ data: { title: 'No times' } });
    expect(missing.status).toBe(400);
    const backwards = await t
      .as(admin)
      .post('/api/events')
      .send({ data: { ...eventBody, endsAt: '2026-10-24T21:00:00.000Z' } });
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.details.errors[0].path).toEqual(['endsAt']);
    const badType = await t
      .as(admin)
      .post('/api/events')
      .send({ data: { ...eventBody, eventType: 'party' } });
    expect(badType.status).toBe(400);
  });

  it('404 when updating or deleting an unknown event', async () => {
    expect(
      (
        await t
          .as(admin)
          .put('/api/events/nope')
          .send({ data: { title: 'x' } })
      ).status,
    ).toBe(404);
    expect((await t.as(admin).delete('/api/events/nope')).status).toBe(404);
  });
});
