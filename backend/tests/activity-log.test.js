'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
beforeAll(async () => {
  t = await createContext();
});
afterAll(async () => {
  await t?.close();
});

/** Runs `fn` as if it were a request from the Strapi admin panel (Content Manager). */
const asAdminPanel = (fn) =>
  t.strapi.requestContext.run(
    {
      request: { path: '/content-manager/collection-types/x' },
      state: { user: { id: 1, email: 'staff@example.test' } },
    },
    fn,
  );

describe('admin-activity-log is append-only', () => {
  it('cannot be updated or deleted through the document service', async () => {
    const entry = await t.strapi.documents(UID.adminActivityLog).create({
      data: { action: 'event_created', targetType: UID.event, targetId: 'x' },
    });
    await expect(
      t.strapi
        .documents(UID.adminActivityLog)
        .update({ documentId: entry.documentId, data: { action: 'event_deleted' } }),
    ).rejects.toThrow('append-only');
    await expect(
      t.strapi.documents(UID.adminActivityLog).delete({ documentId: entry.documentId }),
    ).rejects.toThrow('append-only');
  });

  it('has no REST routes', async () => {
    const admin = await t.makeUser({ role: 'admin' });
    expect((await t.as(admin).get('/api/admin-activity-logs')).status).toBe(404);
  });
});

describe('admin panel writes are logged (document-service middleware)', () => {
  it('event create / update / delete', async () => {
    const event = await asAdminPanel(() =>
      t.makeEvent({ title: 'Panel event' }, { publish: false }),
    );
    await asAdminPanel(() =>
      t.strapi
        .documents(UID.event)
        .update({ documentId: event.documentId, data: { title: 'Renamed' } }),
    );
    await asAdminPanel(() =>
      t.strapi.documents(UID.event).delete({ documentId: event.documentId }),
    );
    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({ where: { targetId: event.documentId }, orderBy: { id: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['event_created', 'event_updated', 'event_deleted']);
    expect(logs[0].details).toMatchObject({
      via: 'admin-panel',
      adminUserEmail: 'staff@example.test',
    });
  });

  it('blight status changes from the panel append statusHistory and are logged', async () => {
    const reporter = await t.makeUser();
    const report = await t.makeReport(reporter);
    const updated = await asAdminPanel(() =>
      t.strapi
        .documents(UID.blightReport)
        .update({ documentId: report.documentId, data: { status: 'resolved' } }),
    );
    expect(updated.statusHistory.map((h) => h.status)).toEqual(['submitted', 'resolved']);
    expect(updated.resolvedAt).toEqual(expect.any(String));
    const log = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: report.documentId } });
    expect(log.action).toBe('report_status_changed');
  });

  it('role changes from the panel are logged; notifications created in the panel are sent', async () => {
    const target = await t.makeUser();
    await t.makeUser({ role: 'admin' });
    await asAdminPanel(() =>
      t.strapi
        .documents(UID.profile)
        .update({ documentId: target.profile.documentId, data: { role: 'admin' } }),
    );
    const roleLog = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: target.profile.documentId } });
    expect(roleLog.action).toBe('role_granted');

    const created = await asAdminPanel(() =>
      t.strapi.documents(UID.notification).create({
        data: {
          title: 'Tree planting volunteers needed',
          message: 'Trees Atlanta',
          category: 'community_announcement',
        },
      }),
    );
    const stored = await t.strapi
      .documents(UID.notification)
      .findOne({ documentId: created.documentId });
    expect(stored.sentAt).toEqual(expect.any(String));
    expect(stored.recipientCount).toBe(0);
    const sentLog = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: created.documentId } });
    expect(sentLog.action).toBe('notification_sent');
  });

  it('writes outside the admin panel (scripts, our API) are not double-logged by the middleware', async () => {
    const event = await t.makeEvent({ title: 'Script event' });
    expect(
      await t.strapi.db
        .query(UID.adminActivityLog)
        .count({ where: { targetId: event.documentId } }),
    ).toBe(0);
  });
});
