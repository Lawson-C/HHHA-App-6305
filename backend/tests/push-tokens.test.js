'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
beforeAll(async () => {
  t = await createContext();
});
afterAll(async () => {
  await t?.close();
});

const token = (n) => `ExponentPushToken[device-${n}-abcdefghijk]`;

describe('push tokens', () => {
  it('guest registers (no profile); later sign-in links it to the profile; no duplicates', async () => {
    const guest = await t.request
      .post('/api/push-tokens')
      .send({ data: { token: token(1), platform: 'android' } });
    expect(guest.status).toBe(201);
    expect(guest.body.data).toMatchObject({
      token: token(1),
      platform: 'android',
      linkedToProfile: false,
    });

    const user = await t.makeUser();
    const linked = await t
      .as(user)
      .post('/api/push-tokens')
      .send({ data: { token: token(1), platform: 'android' } });
    expect(linked.status).toBe(200);
    expect(linked.body.data.linkedToProfile).toBe(true);
    const rows = await t.strapi.db
      .query(UID.pushToken)
      .findMany({ where: { token: token(1) }, populate: ['profile'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].profile.documentId).toBe(user.profile.documentId);
  });

  it('another resident registering the same device token takes it over (device changed hands)', async () => {
    const a = await t.makeUser();
    const b = await t.makeUser();
    await t
      .as(a)
      .post('/api/push-tokens')
      .send({ data: { token: token(2) } });
    await t
      .as(b)
      .post('/api/push-tokens')
      .send({ data: { token: token(2) } });
    const row = await t.strapi.db
      .query(UID.pushToken)
      .findOne({ where: { token: token(2) }, populate: ['profile'] });
    expect(row.profile.documentId).toBe(b.profile.documentId);
  });

  it('400 for malformed tokens or platforms; 401 for a bad bearer', async () => {
    expect((await t.request.post('/api/push-tokens').send({ data: { token: 'abc' } })).status).toBe(
      400,
    );
    expect(
      (
        await t.request
          .post('/api/push-tokens')
          .send({ data: { token: token(3), platform: 'web' } })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.request
          .post('/api/push-tokens')
          .set('Authorization', 'Bearer junk')
          .send({ data: { token: token(3) } })
      ).status,
    ).toBe(401);
  });

  it('DELETE is idempotent for guests and residents (token possession = authority)', async () => {
    const user = await t.makeUser();
    await t
      .as(user)
      .post('/api/push-tokens')
      .send({ data: { token: token(4) } });
    expect(
      (await t.request.delete(`/api/push-tokens/${encodeURIComponent(token(4))}`)).status,
    ).toBe(204);
    expect(await t.strapi.db.query(UID.pushToken).count({ where: { token: token(4) } })).toBe(0);
    expect(
      (await t.as(user).delete(`/api/push-tokens/${encodeURIComponent(token(4))}`)).status,
    ).toBe(204);
  });

  it('the push-token collection is not readable through the API', async () => {
    expect((await t.request.get('/api/push-tokens')).status).toBe(404);
  });
});
