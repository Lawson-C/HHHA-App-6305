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

const body = {
  title: 'Emergency rental assistance',
  category: 'rental_assistance',
  summary: 'Help paying past-due rent and utilities so you can stay in your home.',
  highlights: [
    { value: 'Up to 3', label: 'months of rent' },
    { value: 'Free', label: 'to apply' },
  ],
  eligibility: ['You live in Fulton County'],
  requiredMaterials: ['Photo ID', 'Your lease'],
  contactPhone: '+14045550101',
};

describe('housing resources', () => {
  it.each([
    ['guest', () => null],
    ['resident', () => resident],
    ['admin', () => admin],
  ])('%s can list and read published resources; JSON lists default to []', async (_label, who) => {
    const sparse = await t.makeHousingResource({
      title: 'Senior home repair program',
      category: 'home_repair',
    });
    const draft = await t.makeHousingResource({ title: 'Draft resource' }, { publish: false });
    const list = await t.as(who()).get('/api/housing-resources?filters[category][$eq]=home_repair');
    expect(list.status).toBe(200);
    expect(list.body.data.every((r) => r.category === 'home_repair')).toBe(true);
    expect(list.body.data.map((r) => r.documentId)).not.toContain(draft.documentId);
    const detail = await t.as(who()).get(`/api/housing-resources/${sparse.documentId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      highlights: [],
      eligibility: [],
      requiredMaterials: [],
    });
    expect((await t.as(who()).get(`/api/housing-resources/${draft.documentId}`)).status).toBe(404);
  });

  it('writes: guest 401, resident 403, admin 201/200/204 with activity log', async () => {
    expect((await t.request.post('/api/housing-resources').send({ data: body })).status).toBe(401);
    expect((await t.as(resident).post('/api/housing-resources').send({ data: body })).status).toBe(
      403,
    );

    const created = await t.as(admin).post('/api/housing-resources').send({ data: body });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject(body);
    const id = created.body.data.documentId;
    expect(
      (
        await t
          .as(resident)
          .put(`/api/housing-resources/${id}`)
          .send({ data: { title: 'x' } })
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .as(admin)
          .put(`/api/housing-resources/${id}`)
          .send({ data: { acceptsInquiries: false } })
      ).status,
    ).toBe(200);
    expect((await t.as(resident).delete(`/api/housing-resources/${id}`)).status).toBe(403);
    expect((await t.as(admin).delete(`/api/housing-resources/${id}`)).status).toBe(204);
    const logs = await t.strapi.db
      .query(UID.adminActivityLog)
      .findMany({ where: { targetId: id } });
    expect(logs.map((l) => l.action)).toEqual(Array(3).fill('housing_resource_changed'));
  });

  it('validates category, highlights and lists', async () => {
    const res = await t
      .as(admin)
      .post('/api/housing-resources')
      .send({ data: { ...body, highlights: [{ value: 1 }], eligibility: 'everyone' } });
    expect(res.status).toBe(400);
    expect(
      (
        await t
          .as(admin)
          .post('/api/housing-resources')
          .send({ data: { ...body, category: 'nope' } })
      ).status,
    ).toBe(400);
  });
});

describe('housing listings', () => {
  it('public list newest first with flat imageUrl; filter by neighborhood', async () => {
    const a = await t.strapi.documents(UID.housingListing).create({
      data: {
        title: '2-bedroom apartment',
        address: '640 Lindsay St NW',
        neighborhood: 'english_avenue',
        rentLabel: '$950/mo',
        bedrooms: 2,
      },
      status: 'published',
    });
    const b = await t.strapi.documents(UID.housingListing).create({
      data: {
        title: '3-bedroom house',
        address: '214 Sunset Ave NW',
        neighborhood: 'vine_city',
        rentLabel: '$1,240/mo',
        bedrooms: 3,
      },
      status: 'published',
    });
    for (const who of [null, resident, admin]) {
      const res = await t.as(who).get('/api/housing-listings');
      expect(res.status).toBe(200);
      expect(res.body.data.map((l) => l.documentId).slice(0, 2)).toEqual([
        b.documentId,
        a.documentId,
      ]);
      expect(res.body.data[0]).toMatchObject({ imageUrl: null, bedrooms: 3 });
      expect(res.body.data[0]).not.toHaveProperty('image');
    }
    const filtered = await t.request.get(
      '/api/housing-listings?filters[neighborhood][$eq]=vine_city',
    );
    expect(filtered.body.data.map((l) => l.documentId)).toEqual([b.documentId]);
    expect(
      (await t.request.get(`/api/housing-listings/${a.documentId}`)).body.data.imageUrl,
    ).toBeNull();
  });

  it('writes: guest 401, resident 403, admin OK', async () => {
    const data = { title: 'Studio', address: '1 Test St NW', neighborhood: 'hunter_hills' };
    expect((await t.request.post('/api/housing-listings').send({ data })).status).toBe(401);
    expect((await t.as(resident).post('/api/housing-listings').send({ data })).status).toBe(403);
    const created = await t.as(admin).post('/api/housing-listings').send({ data });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ...data, imageUrl: null });
    expect(
      (await t.as(admin).delete(`/api/housing-listings/${created.body.data.documentId}`)).status,
    ).toBe(204);
    expect(
      (
        await t
          .as(admin)
          .post('/api/housing-listings')
          .send({ data: { title: 'No address' } })
      ).status,
    ).toBe(400);
  });
});
