'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
let resident;
let admin;
beforeAll(async () => {
  t = await createContext();
  resident = await t.makeUser({ fullName: 'Denise Carter', email: 'denise@example.test' });
  admin = await t.makeUser({ role: 'admin', fullName: 'Maya Admin' });
});
afterAll(async () => {
  await t?.close();
});

const ADMIN_GETS = [
  '/api/admin/users',
  '/api/admin/summary',
  '/api/admin/activity',
  '/api/admin/export/blight-reports.csv',
];

describe('admin routes: access', () => {
  it.each(ADMIN_GETS)('GET %s: guest 401, resident 403, admin 200', async (path) => {
    expect((await t.request.get(path)).status).toBe(401);
    expect((await t.as(resident).get(path)).status).toBe(403);
    expect((await t.as(admin).get(path)).status).toBe(200);
  });

  it('PUT role/status: guest 401, resident 403 (even on themselves)', async () => {
    const rolePath = `/api/admin/users/${resident.profile.documentId}/role`;
    const statusPath = `/api/admin/users/${resident.profile.documentId}/status`;
    expect((await t.request.put(rolePath).send({ data: { role: 'admin' } })).status).toBe(401);
    expect(
      (
        await t
          .as(resident)
          .put(rolePath)
          .send({ data: { role: 'admin' } })
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .as(resident)
          .put(statusPath)
          .send({ data: { status: 'active' } })
      ).status,
    ).toBe(403);
  });
});

describe('GET /api/admin/users', () => {
  it('searches by name or email (case-insensitive), includes private contact fields', async () => {
    const byName = await t.as(admin).get('/api/admin/users?q=denise');
    expect(byName.body.data).toEqual([
      expect.objectContaining({
        documentId: resident.profile.documentId,
        email: 'denise@example.test',
        role: 'resident',
        status: 'active',
      }),
    ]);
    const byEmail = await t.as(admin).get('/api/admin/users?q=DENISE@EXAMPLE');
    expect(byEmail.body.data).toHaveLength(1);
    expect(byEmail.body.meta.pagination.total).toBe(1);
  });
});

describe('roles and status', () => {
  it('grant and revoke admin, logged with the actor', async () => {
    const target = await t.makeUser();
    const path = `/api/admin/users/${target.profile.documentId}/role`;
    const granted = await t
      .as(admin)
      .put(path)
      .send({ data: { role: 'admin' } });
    expect(granted.status).toBe(200);
    expect(granted.body.data.role).toBe('admin');
    expect((await t.as(target).get('/api/__test/admin-only')).status).toBe(200);
    const revoked = await t
      .as(admin)
      .put(path)
      .send({ data: { role: 'resident' } });
    expect(revoked.body.data.role).toBe('resident');
    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({
        where: { targetId: target.profile.documentId },
        populate: ['actor'],
        orderBy: { id: 'asc' },
      });
    expect(logs.map((l) => l.action)).toEqual(['role_granted', 'role_revoked']);
    expect(logs[0].actor.documentId).toBe(admin.profile.documentId);
  });

  it('suspend (with end date), ban, reactivate; the user is blocked accordingly', async () => {
    const target = await t.makeUser();
    const path = `/api/admin/users/${target.profile.documentId}/status`;
    const until = new Date(Date.now() + 7 * 86400000).toISOString();
    const suspended = await t
      .as(admin)
      .put(path)
      .send({ data: { status: 'suspended', suspendedUntil: until } });
    expect(suspended.body.data).toMatchObject({ status: 'suspended', suspendedUntil: until });
    expect((await t.as(target).get('/api/me')).status).toBe(403);
    await t
      .as(admin)
      .put(path)
      .send({ data: { status: 'banned' } });
    const reactivated = await t
      .as(admin)
      .put(path)
      .send({ data: { status: 'active' } });
    expect(reactivated.body.data).toMatchObject({ status: 'active', suspendedUntil: null });
    expect((await t.as(target).get('/api/me')).status).toBe(200);
    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({ where: { targetId: target.profile.documentId }, orderBy: { id: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual([
      'account_suspended',
      'account_banned',
      'account_reactivated',
    ]);
  });

  it('validation: bad role/status → 400, unknown user → 404, cannot ban yourself', async () => {
    expect(
      (
        await t
          .as(admin)
          .put(`/api/admin/users/${resident.profile.documentId}/role`)
          .send({ data: { role: 'owner' } })
      ).status,
    ).toBe(400);
    expect(
      (
        await t
          .as(admin)
          .put(`/api/admin/users/${resident.profile.documentId}/status`)
          .send({ data: { status: 'gone' } })
      ).status,
    ).toBe(400);
    expect(
      (
        await t
          .as(admin)
          .put('/api/admin/users/nope/role')
          .send({ data: { role: 'admin' } })
      ).status,
    ).toBe(404);
    expect(
      (
        await t
          .as(admin)
          .put(`/api/admin/users/${admin.profile.documentId}/status`)
          .send({ data: { status: 'banned' } })
      ).status,
    ).toBe(400);
  });
});

describe('last-admin invariant', () => {
  it('rejects demoting or banning the last active admin, through the API and the document service', async () => {
    // Isolated: make sure exactly one active admin exists.
    const admins = await t.strapi.db.query(UID.profile).findMany({ where: { role: 'admin' } });
    for (const a of admins) {
      if (a.documentId !== admin.profile.documentId) {
        await t.strapi.db
          .query(UID.profile)
          .update({ where: { id: a.id }, data: { role: 'resident' } });
      }
    }
    const second = await t.makeUser({ role: 'admin' });
    // second demotes the first: fine (one remains)
    const ok = await t
      .as(second)
      .put(`/api/admin/users/${admin.profile.documentId}/role`)
      .send({ data: { role: 'resident' } });
    expect(ok.status).toBe(200);
    // the remaining admin can't be demoted by anyone... promote first back to try
    await t.strapi.db
      .query(UID.profile)
      .update({ where: { documentId: admin.profile.documentId }, data: { role: 'admin' } });
    await t.strapi.db
      .query(UID.profile)
      .update({ where: { documentId: second.profile.documentId }, data: { role: 'resident' } });
    const lastSelfDemote = await t
      .as(admin)
      .put(`/api/admin/users/${admin.profile.documentId}/role`)
      .send({ data: { role: 'resident' } });
    expect(lastSelfDemote.status).toBe(400);
    expect(lastSelfDemote.body.error.message).toBe('At least one active admin must remain');

    await expect(
      t.strapi
        .documents(UID.profile)
        .update({ documentId: admin.profile.documentId, data: { status: 'banned' } }),
    ).rejects.toThrow('At least one active admin must remain');
    await expect(
      t.strapi.documents(UID.profile).delete({ documentId: admin.profile.documentId }),
    ).rejects.toThrow('At least one active admin must remain');
  });
});

describe('summary, activity, export', () => {
  it('summary returns dashboard counts', async () => {
    await t.makeReport(resident);
    const res = await t.as(admin).get('/api/admin/summary');
    expect(res.body.data).toEqual({
      reports: {
        submitted: expect.any(Number),
        underReview: expect.any(Number),
        active: expect.any(Number),
      },
      inquiries: { new: expect.any(Number), open: expect.any(Number) },
      events: { upcoming: expect.any(Number) },
      users: {
        residents: expect.any(Number),
        admins: expect.any(Number),
        suspendedOrBanned: expect.any(Number),
      },
      notifications: { sentLast30Days: expect.any(Number) },
    });
    expect(res.body.data.reports.submitted).toBeGreaterThan(0);
  });

  it('activity is newest first with the actor', async () => {
    const res = await t.as(admin).get('/api/admin/activity?pagination[pageSize]=5');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toEqual({
      documentId: expect.any(String),
      action: expect.any(String),
      targetType: expect.any(String),
      targetId: expect.anything(),
      details: expect.any(Object),
      actor: expect.anything(),
      createdAt: expect.any(String),
    });
    expect(res.body.meta.pagination.pageSize).toBe(5);
  });

  it('CSV export has no reporter/contact details, neutralizes formulas, and is logged', async () => {
    await t.makeReport(resident, { description: '=HYPERLINK("http://evil")' });
    const res = await t.as(admin).get('/api/admin/export/blight-reports.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const [header, ...rows] = res.text.trim().split('\n');
    expect(header).toBe(
      'id,documentId,category,status,latitude,longitude,address,description,createdAt,resolvedAt',
    );
    expect(res.text).not.toContain('Denise');
    expect(rows.some((r) => r.includes(`"'=HYPERLINK(""http://evil"")"`))).toBe(true);
    const inquiries = await t.as(admin).get('/api/admin/export/housing-inquiries.csv');
    expect(inquiries.text.split('\n')[0]).toBe(
      'documentId,resourceTitle,resourceCategory,status,preferredContact,createdAt',
    );
    expect((await t.as(admin).get('/api/admin/export/profiles.csv')).status).toBe(404);
    const log = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { action: 'data_exported' } });
    expect(log).not.toBeNull();
  });
});
