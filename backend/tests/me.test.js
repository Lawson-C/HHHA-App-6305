'use strict';

const crypto = require('crypto');
const { createContext, UID } = require('./helpers/context');

let t;
beforeAll(async () => {
  t = await createContext();
});
afterAll(async () => {
  await t?.close();
});

describe('GET /api/me', () => {
  it('401 without a token', async () => {
    const res = await t.request.get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.status).toBe(401);
  });

  it('creates exactly one resident profile on first use and returns the documented shape', async () => {
    const sub = crypto.randomUUID();
    const token = await t.supabase.signToken({
      sub,
      email: 'New.User@Example.test',
      metadata: { full_name: 'Denise Carter', phone: '+14045550142', role: 'admin' },
    });
    const res = await t.request.get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      documentId: expect.any(String),
      fullName: 'Denise Carter',
      email: 'new.user@example.test',
      phone: '+14045550142',
      role: 'resident', // metadata role is ignored
      status: 'active',
      suspendedUntil: null,
      neighborhood: null,
      textSize: 'default',
      language: 'en',
      notificationPreferences: {
        healthWarnings: true,
        communityAnnouncements: true,
        meetingReminders: true,
      },
    });
    expect(res.body.data).not.toHaveProperty('id');
    expect(res.body.data).not.toHaveProperty('supabaseUserId');

    const again = await t.request.get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(again.body.data.documentId).toBe(res.body.data.documentId);
    expect(await t.strapi.db.query(UID.profile).count({ where: { supabaseUserId: sub } })).toBe(1);
  });

  it('concurrent first requests create a single profile', async () => {
    const sub = crypto.randomUUID();
    const token = await t.supabase.signToken({ sub });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        t.request.get('/api/me').set('Authorization', `Bearer ${token}`),
      ),
    );
    results.forEach((r) => expect(r.status).toBe(200));
    expect(new Set(results.map((r) => r.body.data.documentId)).size).toBe(1);
    expect(await t.strapi.db.query(UID.profile).count({ where: { supabaseUserId: sub } })).toBe(1);
  });

  it('has a real unique index on supabaseUserId', async () => {
    const indexes = await t.strapi.db.connection.raw("PRAGMA index_list('profiles')");
    const unique = [];
    for (const index of indexes.filter((i) => i.unique)) {
      const cols = await t.strapi.db.connection.raw(`PRAGMA index_info('${index.name}')`);
      unique.push(cols.map((c) => c.name).join(','));
    }
    expect(unique).toContain('supabase_user_id');
  });

  it('falls back to the email local part when there is no full_name (Q-C)', async () => {
    const token = await t.supabase.signToken({ email: 'maya.t@example.test' });
    const res = await t.request.get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.fullName).toBe('maya.t');
  });

  it('ignores an invalid phone from metadata', async () => {
    const token = await t.supabase.signToken({ metadata: { phone: '404-555-0100' } });
    const res = await t.request.get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.phone).toBeNull();
  });

  it('403 for banned and indefinitely suspended profiles, 200 after a suspension ends', async () => {
    const banned = await t.makeUser({ status: 'banned' });
    const res1 = await t.as(banned).get('/api/me');
    expect(res1.status).toBe(403);
    expect(res1.body.error.message).toBe('Account banned');

    const suspended = await t.makeUser({ status: 'suspended' });
    const res2 = await t.as(suspended).get('/api/me');
    expect(res2.status).toBe(403);
    expect(res2.body.error.message).toBe('Account suspended');

    const future = await t.makeUser({
      status: 'suspended',
      suspendedUntil: new Date(Date.now() + 86400000).toISOString(),
    });
    expect((await t.as(future).get('/api/me')).status).toBe(403);

    const past = await t.makeUser({
      status: 'suspended',
      suspendedUntil: new Date(Date.now() - 86400000).toISOString(),
    });
    const res3 = await t.as(past).get('/api/me');
    expect(res3.status).toBe(200);
    expect(res3.body.data.status).toBe('suspended'); // no write-back (Q-D)
  });
});

describe('PUT /api/me', () => {
  it('401 for guests, 403 for banned users', async () => {
    expect((await t.request.put('/api/me').send({ data: { fullName: 'X' } })).status).toBe(401);
    const banned = await t.makeUser({ status: 'banned' });
    expect(
      (
        await t
          .as(banned)
          .put('/api/me')
          .send({ data: { fullName: 'X' } })
      ).status,
    ).toBe(403);
  });

  it('updates editable fields and silently ignores role, status, supabaseUserId and email', async () => {
    const user = await t.makeUser({ prefs: { meetingReminders: true } });
    const res = await t
      .as(user)
      .put('/api/me')
      .send({
        data: {
          fullName: '  Denise Carter ',
          phone: '+14045550142',
          neighborhood: 'english_avenue',
          textSize: 'large',
          language: 'es',
          notificationPreferences: { meetingReminders: false },
          role: 'admin',
          status: 'banned',
          supabaseUserId: crypto.randomUUID(),
          email: 'hijack@example.test',
          suspendedUntil: '2030-01-01T00:00:00.000Z',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      fullName: 'Denise Carter',
      phone: '+14045550142',
      neighborhood: 'english_avenue',
      textSize: 'large',
      language: 'es',
      role: 'resident',
      status: 'active',
      email: user.profile.email,
      suspendedUntil: null,
      notificationPreferences: {
        healthWarnings: true,
        communityAnnouncements: true,
        meetingReminders: false,
      },
    });
    const stored = await t.strapi.db
      .query(UID.profile)
      .findOne({ where: { documentId: user.profile.documentId } });
    expect(stored.role).toBe('resident');
    expect(stored.status).toBe('active');
    expect(stored.supabaseUserId).toBe(user.sub);
  });

  it('returns 400 with per-field details for invalid input', async () => {
    const user = await t.makeUser();
    const res = await t
      .as(user)
      .put('/api/me')
      .send({
        data: {
          fullName: '',
          phone: '555-0100',
          notificationPreferences: { emergency: false, healthWarnings: 'no' },
        },
      });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.errors.map((e) => e.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining([
        'fullName',
        'phone',
        'notificationPreferences.emergency',
        'notificationPreferences.healthWarnings',
      ]),
    );
  });

  it('400 when the body is not wrapped in { data }', async () => {
    const user = await t.makeUser();
    expect((await t.as(user).put('/api/me').send({ fullName: 'X' })).status).toBe(400);
  });
});

describe('no core profile routes', () => {
  it('GET /api/profiles is 404', async () => {
    expect((await t.request.get('/api/profiles')).status).toBe(404);
  });
});
