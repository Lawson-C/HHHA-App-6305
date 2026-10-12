'use strict';

const { createContext } = require('./helpers/context');

let t;
beforeAll(async () => {
  t = await createContext();
});
afterAll(async () => {
  await t?.close();
});

describe('global::is-admin (AC7, test-only route)', () => {
  it('guest → 401', async () => {
    expect((await t.request.get('/api/__test/admin-only')).status).toBe(401);
  });
  it('resident → 403', async () => {
    const res = await t.as(await t.makeUser()).get('/api/__test/admin-only');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Admin only');
  });
  it('admin → 200', async () => {
    expect(
      (await t.as(await t.makeUser({ role: 'admin' })).get('/api/__test/admin-only')).status,
    ).toBe(200);
  });
  it('banned admin → 403', async () => {
    const res = await t
      .as(await t.makeUser({ role: 'admin', status: 'banned' }))
      .get('/api/__test/admin-only');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Account banned');
  });
  it('suspended admin → 403', async () => {
    expect(
      (
        await t
          .as(await t.makeUser({ role: 'admin', status: 'suspended' }))
          .get('/api/__test/admin-only')
      ).status,
    ).toBe(403);
  });
});

describe('global::is-authenticated', () => {
  it('guest 401, resident 200, admin 200, banned 403', async () => {
    expect((await t.request.get('/api/__test/signed-in')).status).toBe(401);
    expect((await t.as(await t.makeUser()).get('/api/__test/signed-in')).status).toBe(200);
    expect(
      (await t.as(await t.makeUser({ role: 'admin' })).get('/api/__test/signed-in')).status,
    ).toBe(200);
    expect(
      (await t.as(await t.makeUser({ status: 'banned' })).get('/api/__test/signed-in')).status,
    ).toBe(403);
  });

  it('includes status and suspendedUntil in the 403 details', async () => {
    const until = new Date(Date.now() + 86400000).toISOString();
    const res = await t
      .as(await t.makeUser({ status: 'suspended', suspendedUntil: until }))
      .get('/api/__test/signed-in');
    expect(res.body.error.details).toEqual({ status: 'suspended', suspendedUntil: until });
  });
});

describe('role comes only from the database (AGENTS rule 3)', () => {
  it('a token claiming admin in user_metadata is still a resident', async () => {
    const token = await t.supabase.signToken({ metadata: { role: 'admin', app_role: 'admin' } });
    const res = await t.request
      .get('/api/__test/admin-only')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
