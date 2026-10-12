'use strict';

const { createContext, UID, FIXTURES } = require('./helpers/context');

let t;
let owner;
let other;
let admin;
beforeAll(async () => {
  t = await createContext();
  owner = await t.makeUser({ fullName: 'Owner Person' });
  other = await t.makeUser();
  admin = await t.makeUser({ role: 'admin' });
});
afterAll(async () => {
  await t?.close();
});

const submit = (user, data, files = [['photo.png', FIXTURES.png, 'image/png']]) => {
  let req = t.request.post('/api/blight-reports');
  if (user) req = req.set(user.auth);
  req = req.field('data', JSON.stringify(data));
  for (const [name, buffer, contentType] of files) {
    req = req.attach('files.images', buffer, { filename: name, contentType });
  }
  return req;
};

const valid = {
  category: 'illegal_dumping',
  description: 'Mattresses and <b>tires</b> in the alley',
  latitude: 33.7601,
  longitude: -84.4231,
  address: 'Behind 600 Lindsay St NW',
  keepNamePrivate: true,
};

describe('POST /api/blight-reports', () => {
  it('guest → 401', async () => {
    expect((await submit(null, valid)).status).toBe(401);
  });

  it('banned resident → 403', async () => {
    expect((await submit(await t.makeUser({ status: 'banned' }), valid)).status).toBe(403);
  });

  it('resident → 201; status, reporter and statusHistory are set server-side', async () => {
    const forged = {
      ...valid,
      status: 'resolved',
      reporter: other.profile.documentId,
      statusHistory: [],
    };
    const res = await submit(owner, forged);
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data).toMatchObject({
      id: expect.any(Number),
      documentId: expect.any(String),
      category: 'illegal_dumping',
      description: 'Mattresses and tires in the alley', // HTML stripped
      latitude: 33.7601,
      longitude: -84.4231,
      address: 'Behind 600 Lindsay St NW',
      status: 'submitted',
      keepNamePrivate: true,
      statusHistory: [{ status: 'submitted', at: expect.any(String) }],
    });
    expect(data.imageUrls).toHaveLength(1);
    expect(data.imageUrls[0]).toMatch(/^\/uploads\/.+\.png$/);
    expect(data).not.toHaveProperty('reporter');
    expect(res.body.meta).toEqual({ possibleDuplicates: [] });

    const stored = await t.strapi.documents(UID.blightReport).findOne({
      documentId: data.documentId,
      populate: ['reporter'],
    });
    expect(stored.reporter.documentId).toBe(owner.profile.documentId);
  });

  it('strips EXIF metadata from uploaded photos', async () => {
    expect(FIXTURES.jpegWithExif.includes(Buffer.from('SecretCam'))).toBe(true);
    const res = await submit(owner, valid, [['camera.jpg', FIXTURES.jpegWithExif, 'image/jpeg']]);
    expect(res.status).toBe(201);
    const stored = await t.request.get(res.body.data.imageUrls[0]);
    expect(stored.status).toBe(200);
    expect(stored.body.includes(Buffer.from('SecretCam'))).toBe(false);
    expect(stored.body.includes(Buffer.from('GPS 33.7590'))).toBe(false);
  });

  it('warns about a likely duplicate nearby (Q-013) but still accepts it', async () => {
    const first = await submit(owner, { ...valid, latitude: 33.7701, longitude: -84.4301 });
    const second = await submit(other, { ...valid, latitude: 33.77012, longitude: -84.43012 });
    expect(second.status).toBe(201);
    expect(second.body.meta.possibleDuplicates).toContain(first.body.data.documentId);
  });

  it('400 for missing category, outside District 3, too-long description', async () => {
    const res = await submit(owner, {
      latitude: 40.7,
      longitude: -74,
      description: 'x'.repeat(2001),
    });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.errors.map((e) => e.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['category', 'latitude', 'description']));
  });

  it('400 without photos, with too many, or with a non-image', async () => {
    expect((await submit(owner, valid, [])).status).toBe(400);
    const six = Array.from({ length: 6 }, (_, i) => [`p${i}.png`, FIXTURES.png, 'image/png']);
    expect((await submit(owner, valid, six)).status).toBe(400);
    expect((await submit(owner, valid, [['evil.png', FIXTURES.text, 'image/png']])).status).toBe(
      400,
    );
    expect(
      (await submit(owner, valid, [['doc.pdf', FIXTURES.pdf, 'application/pdf']])).status,
    ).toBe(400);
    expect((await submit(owner, valid, [['photo.jpg', FIXTURES.png, 'image/jpeg']])).status).toBe(
      400,
    );
  });
});

describe('GET /api/blight-reports (public list)', () => {
  let active;
  let resolved;
  let removed;
  beforeAll(async () => {
    active = await t.makeReport(owner, {
      category: 'vacant_lot',
      latitude: 33.75,
      longitude: -84.44,
    });
    resolved = await t.makeReport(owner, { status: 'resolved' });
    removed = await t.makeReport(owner, { status: 'removed' });
  });

  it.each([
    ['guest', () => null],
    ['resident', () => owner],
    ['other resident', () => other],
  ])('%s sees active reports only, never the reporter', async (_label, who) => {
    const res = await t.as(who()).get('/api/blight-reports?pagination[pageSize]=100');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r.documentId);
    expect(ids).toContain(active.documentId);
    expect(ids).not.toContain(resolved.documentId);
    expect(ids).not.toContain(removed.documentId);
    for (const report of res.body.data) {
      expect(report).not.toHaveProperty('reporter');
      expect(report).not.toHaveProperty('keepNamePrivate');
      expect(['submitted', 'under_review', 'reported_to_city']).toContain(report.status);
    }
    expect(res.body.meta.pagination).toMatchObject({ page: 1, pageSize: 100 });
    expect(JSON.stringify(res.body)).not.toContain('Owner Person');
  });

  it('guests cannot widen the status filter', async () => {
    const res = await t.request.get('/api/blight-reports?status=resolved,removed');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('admins can list any status and see the reporter', async () => {
    const res = await t.as(admin).get('/api/blight-reports?status=removed');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.documentId)).toEqual([removed.documentId]);
    expect(res.body.data[0].reporter).toEqual({
      documentId: owner.profile.documentId,
      fullName: 'Owner Person',
    });
  });

  it('filters by category and by distance (near + radiusKm), sorted by distance', async () => {
    const byCategory = await t.request.get('/api/blight-reports?category=vacant_lot');
    expect(byCategory.body.data.every((r) => r.category === 'vacant_lot')).toBe(true);

    const near = await t.request.get('/api/blight-reports?near=33.7501,-84.4401&radiusKm=0.5');
    expect(near.status).toBe(200);
    expect(near.body.data.map((r) => r.documentId)).toEqual([active.documentId]);
    expect(near.body.data[0].distanceKm).toBeLessThan(0.05);
  });

  it('400 on bad filters', async () => {
    expect((await t.request.get('/api/blight-reports?category=nope')).status).toBe(400);
    expect((await t.request.get('/api/blight-reports?near=abc')).status).toBe(400);
    expect((await t.request.get('/api/blight-reports?near=33.7,-84.4&radiusKm=500')).status).toBe(
      400,
    );
  });
});

describe('GET /api/blight-reports/:documentId', () => {
  it('active report: guest 200 without reporter', async () => {
    const report = await t.makeReport(owner);
    const res = await t.request.get(`/api/blight-reports/${report.documentId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('reporter');
  });

  it('resolved report: guest/other 404, owner 200, admin 200 with reporter', async () => {
    const report = await t.makeReport(owner, {
      status: 'resolved',
      resolutionNote: 'Cleared by the City',
    });
    const path = `/api/blight-reports/${report.documentId}`;
    expect((await t.request.get(path)).status).toBe(404);
    expect((await t.as(other).get(path)).status).toBe(404);
    const mine = await t.as(owner).get(path);
    expect(mine.status).toBe(200);
    expect(mine.body.data.resolutionNote).toBe('Cleared by the City');
    expect(mine.body.data).not.toHaveProperty('reporter');
    const asAdmin = await t.as(admin).get(path);
    expect(asAdmin.body.data.reporter.documentId).toBe(owner.profile.documentId);
  });

  it('unknown id → 404', async () => {
    expect((await t.request.get('/api/blight-reports/doesnotexist')).status).toBe(404);
  });
});

describe('GET /api/blight-reports/mine', () => {
  it('guest 401; resident sees only their own, every status', async () => {
    expect((await t.request.get('/api/blight-reports/mine')).status).toBe(401);
    const mine = await t.as(owner).get('/api/blight-reports/mine?pagination[pageSize]=100');
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    const statuses = new Set(mine.body.data.map((r) => r.status));
    expect(statuses.has('resolved')).toBe(true);
    const otherMine = await t.as(other).get('/api/blight-reports/mine?pagination[pageSize]=100');
    const ownerIds = new Set(mine.body.data.map((r) => r.documentId));
    expect(otherMine.body.data.some((r) => ownerIds.has(r.documentId))).toBe(false);
  });
});

describe('PUT /api/blight-reports/:documentId', () => {
  it('guest 401, resident (even the owner) 403', async () => {
    const report = await t.makeReport(owner);
    const path = `/api/blight-reports/${report.documentId}`;
    expect((await t.request.put(path).send({ data: { status: 'resolved' } })).status).toBe(401);
    expect(
      (
        await t
          .as(owner)
          .put(path)
          .send({ data: { status: 'resolved' } })
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .as(other)
          .put(path)
          .send({ data: { status: 'resolved' } })
      ).status,
    ).toBe(403);
  });

  it('admin changes status: history appended, resolvedAt set, activity logged', async () => {
    const report = await t.makeReport(owner);
    const path = `/api/blight-reports/${report.documentId}`;
    const step1 = await t
      .as(admin)
      .put(path)
      .send({ data: { status: 'under_review' } });
    expect(step1.status).toBe(200);
    const step2 = await t
      .as(admin)
      .put(path)
      .send({ data: { status: 'resolved', resolutionNote: 'Cleaned up', statusHistory: [] } });
    expect(step2.body.data.statusHistory.map((h) => h.status)).toEqual([
      'submitted',
      'under_review',
      'resolved',
    ]);
    expect(step2.body.data.resolvedAt).toEqual(expect.any(String));
    expect(step2.body.data.resolutionNote).toBe('Cleaned up');

    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({
        where: { targetId: report.documentId },
        populate: ['actor'],
        orderBy: { id: 'asc' },
      });
    expect(logs.map((l) => l.action)).toEqual(['report_status_changed', 'report_status_changed']);
    expect(logs[0].actor.documentId).toBe(admin.profile.documentId);
  });

  it('admin removes (soft delete) → report_removed; the record still exists', async () => {
    const report = await t.makeReport(owner);
    const res = await t
      .as(admin)
      .put(`/api/blight-reports/${report.documentId}`)
      .send({ data: { status: 'removed' } });
    expect(res.status).toBe(200);
    expect(
      await t.strapi.documents(UID.blightReport).findOne({ documentId: report.documentId }),
    ).not.toBeNull();
    const log = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: report.documentId } });
    expect(log.action).toBe('report_removed');
  });

  it('admin edit without status change → report_edited; 400 on bad status; 404 unknown', async () => {
    const report = await t.makeReport(owner);
    const path = `/api/blight-reports/${report.documentId}`;
    expect(
      (
        await t
          .as(admin)
          .put(path)
          .send({ data: { description: 'Updated' } })
      ).status,
    ).toBe(200);
    const log = await t.strapi.db
      .query(UID.adminActivityLog)
      .findOne({ where: { targetId: report.documentId } });
    expect(log.action).toBe('report_edited');
    expect(
      (
        await t
          .as(admin)
          .put(path)
          .send({ data: { status: 'nope' } })
      ).status,
    ).toBe(400);
    expect(
      (
        await t
          .as(admin)
          .put('/api/blight-reports/missing')
          .send({ data: { status: 'resolved' } })
      ).status,
    ).toBe(404);
  });
});
