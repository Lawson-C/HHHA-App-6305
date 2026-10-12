'use strict';

const { createContext, UID, FIXTURES } = require('./helpers/context');

let t;
let owner;
let other;
let admin;
let resource;
beforeAll(async () => {
  t = await createContext();
  owner = await t.makeUser({ fullName: 'Inquiry Owner' });
  other = await t.makeUser();
  admin = await t.makeUser({ role: 'admin' });
  resource = await t.makeHousingResource();
});
afterAll(async () => {
  await t?.close();
});

const submit = (user, data, files = []) => {
  let req = t.request.post('/api/housing-inquiries');
  if (user) req = req.set(user.auth);
  req = req.field('data', JSON.stringify(data));
  for (const [name, buffer, contentType] of files) {
    req = req.attach('files.attachments', buffer, { filename: name, contentType });
  }
  return req;
};

describe('housing inquiries', () => {
  let inquiryId;

  it('guest → 401', async () => {
    expect(
      (
        await submit(null, {
          housingResource: resource.documentId,
          message: 'Hi',
          preferredContact: 'email',
        })
      ).status,
    ).toBe(401);
    expect((await t.request.get('/api/housing-inquiries')).status).toBe(401);
  });

  it('resident creates with attachments; profile comes from the token', async () => {
    const res = await submit(
      owner,
      {
        housingResource: resource.documentId,
        message: 'I am two months behind on rent.',
        preferredContact: 'phone',
        profile: other.profile.documentId,
        status: 'closed',
      },
      [['lease.pdf', FIXTURES.pdf, 'application/pdf']],
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      message: 'I am two months behind on rent.',
      preferredContact: 'phone',
      status: 'new',
      housingResource: {
        documentId: resource.documentId,
        title: resource.title,
        category: 'rental_assistance',
      },
      attachments: [{ name: 'lease.pdf', mime: 'application/pdf', url: expect.any(String) }],
    });
    expect(res.body.data).not.toHaveProperty('adminNotes');
    inquiryId = res.body.data.documentId;
    const stored = await t.strapi
      .documents(UID.housingInquiry)
      .findOne({ documentId: inquiryId, populate: ['profile'] });
    expect(stored.profile.documentId).toBe(owner.profile.documentId);
  });

  it('validation: message, contact, resource, file types, attachments not allowed', async () => {
    const res = await submit(owner, { housingResource: resource.documentId });
    expect(res.status).toBe(400);
    expect(
      (await submit(owner, { housingResource: 'nope', message: 'x', preferredContact: 'email' }))
        .status,
    ).toBe(404);
    const bad = await submit(
      owner,
      { housingResource: resource.documentId, message: 'x', preferredContact: 'email' },
      [['script.pdf', FIXTURES.text, 'application/pdf']],
    );
    expect(bad.status).toBe(400);
    const noFiles = await t.makeHousingResource({ inquiryAllowsAttachments: false });
    const rejected = await submit(
      owner,
      { housingResource: noFiles.documentId, message: 'x', preferredContact: 'email' },
      [['lease.pdf', FIXTURES.pdf, 'application/pdf']],
    );
    expect(rejected.status).toBe(400);
    const closed = await t.makeHousingResource({ acceptsInquiries: false });
    expect(
      (
        await submit(owner, {
          housingResource: closed.documentId,
          message: 'x',
          preferredContact: 'email',
        })
      ).status,
    ).toBe(400);
  });

  it('read: owner sees own, other resident sees none (404 on detail), admin sees all with contact info', async () => {
    const mine = await t.as(owner).get('/api/housing-inquiries');
    expect(mine.body.data.map((i) => i.documentId)).toContain(inquiryId);
    expect(mine.body.data[0]).not.toHaveProperty('profile');

    const others = await t.as(other).get('/api/housing-inquiries');
    expect(others.body.data).toHaveLength(0);
    expect((await t.as(other).get(`/api/housing-inquiries/${inquiryId}`)).status).toBe(404);

    const detail = await t.as(owner).get(`/api/housing-inquiries/${inquiryId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.attachments[0].url).toEqual(expect.any(String));

    const all = await t.as(admin).get('/api/housing-inquiries?status=new');
    expect(all.body.data.map((i) => i.documentId)).toContain(inquiryId);
    const adminDetail = await t.as(admin).get(`/api/housing-inquiries/${inquiryId}`);
    expect(adminDetail.body.data.profile).toMatchObject({
      documentId: owner.profile.documentId,
      fullName: 'Inquiry Owner',
    });
  });

  it('update: resident 403 (even owner), admin can change status and notes only', async () => {
    const path = `/api/housing-inquiries/${inquiryId}`;
    expect((await t.request.put(path).send({ data: { status: 'closed' } })).status).toBe(401);
    expect(
      (
        await t
          .as(owner)
          .put(path)
          .send({ data: { status: 'closed' } })
      ).status,
    ).toBe(403);
    const res = await t
      .as(admin)
      .put(path)
      .send({ data: { status: 'in_progress', adminNotes: 'Called back', message: 'rewritten' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'in_progress',
      adminNotes: 'Called back',
      message: 'I am two months behind on rent.',
    });
    expect(
      (
        await t
          .as(admin)
          .put(path)
          .send({ data: { status: 'nope' } })
      ).status,
    ).toBe(400);
    const ownerView = await t.as(owner).get(path);
    expect(ownerView.body.data).not.toHaveProperty('adminNotes');
  });
});
