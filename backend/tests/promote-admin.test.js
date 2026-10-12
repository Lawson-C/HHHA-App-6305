'use strict';

const path = require('path');
const { createContext, UID } = require('./helpers/context');

let t;
let promoteAdmin;
beforeAll(async () => {
  t = await createContext();
  ({ promoteAdmin } = require(
    path.resolve(__dirname, '..', 'dist', 'src', 'services', 'promote-admin.js'),
  ));
});
afterAll(async () => {
  await t?.close();
});

describe('promote-admin (AC8)', () => {
  it('promotes by email, case-insensitively, and logs the change', async () => {
    const user = await t.makeUser({ email: 'maya@example.test' });
    expect(await promoteAdmin('  MAYA@Example.TEST ')).toBe('maya@example.test is now an admin.');
    const stored = await t.strapi.db
      .query(UID.profile)
      .findOne({ where: { documentId: user.profile.documentId } });
    expect(stored.role).toBe('admin');
    const res = await t.as(user).get('/api/me');
    expect(res.body.data.role).toBe('admin');
    const log = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: user.profile.documentId } });
    expect(log.action).toBe('role_granted');
  });

  it('is a no-op for an existing admin', async () => {
    await t.makeUser({ email: 'already@example.test', role: 'admin' });
    expect(await promoteAdmin('already@example.test')).toMatch(/already an admin/);
  });

  it('errors for an unknown email, a duplicate email, or a banned account', async () => {
    await expect(promoteAdmin('nobody@example.test')).rejects.toThrow(/sign in to the app once/);
    await t.makeUser({ email: 'dup@example.test' });
    await t.makeUser({ email: 'dup@example.test' });
    await expect(promoteAdmin('dup@example.test')).rejects.toThrow(/More than one profile/);
    await t.makeUser({ email: 'banned@example.test', status: 'banned' });
    await expect(promoteAdmin('banned@example.test')).rejects.toThrow(/banned/);
    await expect(promoteAdmin('')).rejects.toThrow(/Usage/);
  });
});
