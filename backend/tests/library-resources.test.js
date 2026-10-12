'use strict';

const { createContext, UID } = require('./helpers/context');

let t;
let resident;
let admin;
beforeAll(async () => {
  t = await createContext();
  resident = await t.makeUser();
  admin = await t.makeUser({ role: 'admin' });
  await t.strapi.documents(UID.libraryResource).create({
    data: {
      title: 'Free tax help near you',
      description: 'IRS VITA',
      category: 'financial_tools',
      resourceType: 'link',
      url: 'https://irs.treasury.gov/freetaxprep/',
    },
    status: 'published',
  });
  await t.strapi.documents(UID.libraryResource).create({
    data: {
      title: 'Your guide to the Hunter Hills app',
      description: 'Tour',
      category: 'education',
      resourceType: 'video',
      url: 'https://example.org',
      featured: true,
      durationMinutes: 3,
    },
    status: 'published',
  });
});
afterAll(async () => {
  await t?.close();
});

describe('library resources', () => {
  it.each([
    ['guest', () => null],
    ['resident', () => resident],
    ['admin', () => admin],
  ])('%s can list (featured first) and filter', async (_label, who) => {
    const res = await t.as(who()).get('/api/library-resources');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ featured: true, durationMinutes: 3 });
    const money = await t
      .as(who())
      .get(
        '/api/library-resources?filters[category][$eq]=financial_tools&filters[resourceType][$eq]=link',
      );
    expect(money.body.data.map((r) => r.title)).toEqual(['Free tax help near you']);
    const detail = await t.as(who()).get(`/api/library-resources/${money.body.data[0].documentId}`);
    expect(detail.status).toBe(200);
  });

  it('writes: guest 401, resident 403, admin OK + logged; videos/links need a URL', async () => {
    const data = {
      title: 'GED classes',
      description: 'Free classes',
      category: 'education',
      resourceType: 'article',
      body: '## Hello',
    };
    expect((await t.request.post('/api/library-resources').send({ data })).status).toBe(401);
    expect((await t.as(resident).post('/api/library-resources').send({ data })).status).toBe(403);
    const created = await t.as(admin).post('/api/library-resources').send({ data });
    expect(created.status).toBe(201);
    const id = created.body.data.documentId;
    const bad = await t
      .as(admin)
      .put(`/api/library-resources/${id}`)
      .send({ data: { resourceType: 'video' } });
    expect(bad.status).toBe(400);
    expect((await t.as(resident).delete(`/api/library-resources/${id}`)).status).toBe(403);
    expect((await t.as(admin).delete(`/api/library-resources/${id}`)).status).toBe(204);
    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({ where: { targetId: id } });
    expect(logs.map((l) => l.action)).toEqual([
      'library_resource_changed',
      'library_resource_changed',
    ]);
  });
});
