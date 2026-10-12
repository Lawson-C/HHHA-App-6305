'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
let owner;
let other;
let admin;
let event;
beforeAll(async () => {
  t = await createContext();
  owner = await t.makeUser();
  other = await t.makeUser();
  admin = await t.makeUser({ role: 'admin' });
  event = await t.makeEvent({ startsAt: new Date(Date.now() + 3 * 86400000).toISOString() });
});
afterAll(async () => {
  await t?.close();
});

describe('event reminders', () => {
  it('guest → 401 on every route', async () => {
    expect((await t.request.get('/api/event-reminders')).status).toBe(401);
    expect(
      (await t.request.post('/api/event-reminders').send({ data: { event: event.documentId } }))
        .status,
    ).toBe(401);
    expect((await t.request.delete('/api/event-reminders/x')).status).toBe(401);
  });

  it('resident creates one (remindAt = 24 h before), duplicates → 409', async () => {
    const res = await t
      .as(owner)
      .post('/api/event-reminders')
      .send({ data: { event: event.documentId, profile: other.profile.documentId } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      documentId: expect.any(String),
      sentAt: null,
      event: { documentId: event.documentId, title: event.title },
    });
    const expected = new Date(new Date(event.startsAt).getTime() - 86400000).toISOString();
    expect(res.body.data.remindAt).toBe(expected);
    // profile in the body is ignored: the reminder belongs to the caller
    const stored = await t.strapi.documents(UID.eventReminder).findOne({
      documentId: res.body.data.documentId,
      populate: ['profile'],
    });
    expect(stored.profile.documentId).toBe(owner.profile.documentId);

    const dup = await t
      .as(owner)
      .post('/api/event-reminders')
      .send({ data: { event: event.documentId } });
    expect(dup.status).toBe(409);
  });

  it('concurrent duplicates still produce one reminder', async () => {
    const e2 = await t.makeEvent();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        t
          .as(other)
          .post('/api/event-reminders')
          .send({ data: { event: e2.documentId } }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it('404 for unknown or unpublished events, 400 without event', async () => {
    const draft = await t.makeEvent({}, { publish: false });
    expect(
      (
        await t
          .as(owner)
          .post('/api/event-reminders')
          .send({ data: { event: draft.documentId } })
      ).status,
    ).toBe(404);
    expect(
      (
        await t
          .as(owner)
          .post('/api/event-reminders')
          .send({ data: { event: 'nope' } })
      ).status,
    ).toBe(404);
    expect((await t.as(owner).post('/api/event-reminders').send({ data: {} })).status).toBe(400);
  });

  it('list is own only (admins also only see their own)', async () => {
    const mine = await t.as(owner).get('/api/event-reminders');
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    const adminList = await t.as(admin).get('/api/event-reminders');
    expect(adminList.body.data).toHaveLength(0);
    const otherList = await t.as(other).get('/api/event-reminders');
    const mineIds = new Set(mine.body.data.map((r) => r.documentId));
    expect(otherList.body.data.some((r) => mineIds.has(r.documentId))).toBe(false);
  });

  it('delete: other resident 404, admin 404, owner 204', async () => {
    const e3 = await t.makeEvent();
    const created = await t
      .as(owner)
      .post('/api/event-reminders')
      .send({ data: { event: e3.documentId } });
    const path = `/api/event-reminders/${created.body.data.documentId}`;
    expect((await t.as(other).delete(path)).status).toBe(404);
    expect((await t.as(admin).delete(path)).status).toBe(404);
    expect((await t.as(owner).delete(path)).status).toBe(204);
    expect((await t.as(owner).delete(path)).status).toBe(404);
  });

  it('banned users → 403', async () => {
    const banned = await t.makeUser({ status: 'banned' });
    expect((await t.as(banned).get('/api/event-reminders')).status).toBe(403);
  });
});

describe('reminder delivery (cron task)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    t.strapi.config.set('hhha.push.enabled', false);
  });

  it('does nothing while push is disabled', async () => {
    const { sendDueReminders } = require('../dist/src/services/reminders.js');
    expect(await sendDueReminders(t.strapi)).toEqual({ sent: 0 });
  });

  it("sends due reminders once to the owner's devices and marks them sent", async () => {
    const { sendDueReminders, defaultRemindAt } = require('../dist/src/services/reminders.js');
    const user = await t.makeUser();
    const token = 'ExponentPushToken[reminder-device-abcdefgh]';
    await t.as(user).post('/api/push-tokens').send({ data: { token } });
    const soon = await t.makeEvent({
      title: 'Yoga in the park',
      startsAt: new Date(Date.now() + 30 * 60000).toISOString(),
    });
    const created = await t
      .as(user)
      .post('/api/event-reminders')
      .send({ data: { event: soon.documentId } });
    // Less than 1 h away → remind right away.
    expect(new Date(created.body.data.remindAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(defaultRemindAt(new Date(Date.now() + 5 * 3600000)).getTime()).toBeCloseTo(
      Date.now() + 4 * 3600000,
      -4,
    );

    t.strapi.config.set('hhha.push.enabled', true);
    const sent = [];
    global.fetch = jest.fn(async (_url, init) => {
      const batch = JSON.parse(init.body);
      sent.push(...batch);
      return { ok: true, json: async () => ({ data: batch.map(() => ({ status: 'ok' })) }) };
    });
    const first = await sendDueReminders(t.strapi);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(sent.find((m) => m.to === token)).toMatchObject({ title: 'Reminder: Yoga in the park' });
    const again = await sendDueReminders(t.strapi);
    expect(again.sent).toBe(0);
  });
});
