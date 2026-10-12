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

const registerToken = async (user, n) => {
  const token = `ExponentPushToken[test-token-${n}-abcdefghij]`;
  const req = t.request.post('/api/push-tokens').send({ data: { token, platform: 'ios' } });
  await (user ? req.set(user.auth) : req);
  return token;
};

const alert = {
  title: 'Boil water advisory',
  message: 'Boil tap water before drinking, cooking or brushing teeth.',
  category: 'emergency',
  issuer: 'City of Atlanta Watershed Management',
  body: 'A water main break lowered pressure in parts of District 3.',
  actionSteps: ['Boil tap water for at least 1 minute before drinking, cooking or brushing teeth.'],
  affectedArea: 'English Avenue, Vine City and parts of Hunter Hills north of MLK Jr. Dr.',
};

describe('notifications', () => {
  it('POST: guest 401, resident 403', async () => {
    expect((await t.request.post('/api/notifications').send({ data: alert })).status).toBe(401);
    expect((await t.as(resident).post('/api/notifications').send({ data: alert })).status).toBe(
      403,
    );
  });

  it('admin sends: stored with sentBy/sentAt, recipients respect preferences, logged', async () => {
    const optedOut = await t.makeUser({ prefs: { healthWarnings: false } });
    await registerToken(resident, 1);
    await registerToken(optedOut, 2);
    await registerToken(null, 3); // guest device

    const emergency = await t.as(admin).post('/api/notifications').send({ data: alert });
    expect(emergency.status).toBe(201);
    expect(emergency.body.data).toMatchObject({
      ...alert,
      documentId: expect.any(String),
      sentAt: expect.any(String),
      recipientCount: 3, // emergency → every device, guests included
    });
    expect(emergency.body.data).not.toHaveProperty('sentBy');

    const health = await t
      .as(admin)
      .post('/api/notifications')
      .send({
        data: { title: 'Mosquito spraying tonight', message: '9 PM', category: 'health_warning' },
      });
    expect(health.body.data.recipientCount).toBe(1); // opted-out user and guest excluded

    const stored = await t.strapi.documents(UID.notification).findOne({
      documentId: emergency.body.data.documentId,
      populate: ['sentBy'],
    });
    expect(stored.sentBy.documentId).toBe(admin.profile.documentId);
    const log = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: stored.documentId } });
    expect(log.action).toBe('notification_sent');
  });

  it('400 for missing fields, long titles, bad category', async () => {
    const res = await t
      .as(admin)
      .post('/api/notifications')
      .send({ data: { title: 'x'.repeat(66), category: 'spam' } });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.errors.map((e) => e.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['title', 'message', 'category']));
  });

  it('GET list/detail: public, newest first, only sent alerts, no sender', async () => {
    const unsent = await t.strapi.documents(UID.notification).create({
      data: { title: 'Draft alert', message: 'not sent', category: 'community_announcement' },
    });
    for (const who of [null, resident, admin]) {
      const res = await t.as(who).get('/api/notifications');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((n) => n.documentId);
      expect(ids).not.toContain(unsent.documentId);
      const sentAts = res.body.data.map((n) => n.sentAt);
      expect([...sentAts].sort().reverse()).toEqual(sentAts);
      for (const n of res.body.data) {
        expect(n).not.toHaveProperty('sentBy');
        expect(Array.isArray(n.actionSteps)).toBe(true);
      }
      const detail = await t.as(who).get(`/api/notifications/${ids[0]}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toHaveProperty('affectedArea');
    }
    expect((await t.request.get(`/api/notifications/${unsent.documentId}`)).status).toBe(404);
    const health = await t.request.get(
      '/api/notifications?filters[category][$in][0]=health_warning',
    );
    expect(health.body.data.every((n) => n.category === 'health_warning')).toBe(true);
  });
});

describe('Expo push delivery (PUSH_ENABLED)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    t.strapi.config.set('hhha.push.enabled', false);
  });

  it('sends in batches of 100 and removes DeviceNotRegistered tokens', async () => {
    const { sendPushMessages } = require('../dist/src/services/push.js');
    t.strapi.config.set('hhha.push.enabled', true);
    const batches = [];
    global.fetch = jest.fn(async (url, init) => {
      const batch = JSON.parse(init.body);
      batches.push(batch);
      return {
        ok: true,
        json: async () => ({
          data: batch.map((m) =>
            m.to.includes('dead')
              ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok', id: 'x' },
          ),
        }),
      };
    });
    const dead = 'ExponentPushToken[dead-token-abcdefghij]';
    await t.strapi.documents(UID.pushToken).create({ data: { token: dead } });
    const messages = Array.from({ length: 249 }, (_, i) => ({
      to: `ExponentPushToken[t${i}-abcdefghijk]`,
      title: 'a',
      body: 'b',
    }));
    messages.push({ to: dead, title: 'a', body: 'b' });
    const result = await sendPushMessages(t.strapi, messages);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(result).toEqual({ attempted: 250, ok: 249, removedTokens: 1 });
    expect(await t.strapi.db.query(UID.pushToken).count({ where: { token: dead } })).toBe(0);
  });

  it('does not touch the network when push is disabled', async () => {
    const { sendPushMessages } = require('../dist/src/services/push.js');
    global.fetch = jest.fn();
    const result = await sendPushMessages(t.strapi, [
      { to: 'ExponentPushToken[x-abcdefghijk]', title: 'a', body: 'b' },
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.attempted).toBe(0);
  });
});
