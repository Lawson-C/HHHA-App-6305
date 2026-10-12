'use strict';

const crypto = require('crypto');
const supertest = require('supertest');
const { setupStrapi, teardownStrapi } = require('../strapi');
const { startFakeSupabase } = require('./supabase');

const UID = {
  profile: 'api::profile.profile',
  blightReport: 'api::blight-report.blight-report',
  event: 'api::event.event',
  eventReminder: 'api::event-reminder.event-reminder',
  housingResource: 'api::housing-resource.housing-resource',
  housingListing: 'api::housing-listing.housing-listing',
  housingInquiry: 'api::housing-inquiry.housing-inquiry',
  notification: 'api::notification.notification',
  pushToken: 'api::push-token.push-token',
  libraryResource: 'api::library-resource.library-resource',
  environmentalSource: 'api::environmental-source.environmental-source',
  environmentalReading: 'api::environmental-reading.environmental-reading',
  adminActivityLog: 'api::admin-activity-log.admin-activity-log',
};

const sharp = require('sharp');

/** Small upload fixtures. Filled by createContext() (sharp is async). */
const FIXTURES = {
  png: null,
  /** A JPEG carrying EXIF metadata (a camera model + GPS-like comment) to test stripping. */
  jpegWithExif: null,
  pdf: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  text: Buffer.from('just some text, not an image'),
};

async function buildFixtures() {
  if (FIXTURES.png) return;
  const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#c0392b' } });
  FIXTURES.png = await base.clone().png().toBuffer();
  FIXTURES.jpegWithExif = await base
    .clone()
    .jpeg()
    .withMetadata({
      exif: { IFD0: { Model: 'SecretCam 3000', ImageDescription: 'GPS 33.7590,-84.4250' } },
    })
    .toBuffer();
}

/**
 * Boots one Strapi + fake Supabase for a test file and returns helpers.
 * Call in beforeAll; call ctx.close() in afterAll.
 */
async function createContext() {
  await buildFixtures();
  const supabase = await startFakeSupabase();
  const strapi = await setupStrapi();
  const request = supertest(strapi.server.httpServer);

  /**
   * Creates a profile directly (role/status as given) plus a valid token for it.
   * Returns { profile, token, auth, sub }.
   */
  async function makeUser({
    role = 'resident',
    status = 'active',
    suspendedUntil = null,
    fullName,
    email,
    prefs,
  } = {}) {
    const sub = crypto.randomUUID();
    const mail = email ?? `${sub.slice(0, 8)}@example.test`;
    const profile = await strapi.documents(UID.profile).create({
      data: {
        supabaseUserId: sub,
        fullName: fullName ?? `User ${sub.slice(0, 4)}`,
        email: mail,
        role,
        status,
        suspendedUntil,
        notificationPreferences: {
          healthWarnings: true,
          communityAnnouncements: true,
          meetingReminders: true,
          ...prefs,
        },
      },
    });
    const token = await supabase.signToken({ sub, email: mail });
    return { sub, profile, token, auth: { Authorization: `Bearer ${token}` } };
  }

  /** Request helper: as(user).get(path) — user may be null for a guest. */
  const as = (user) => {
    const wrap = (method) => (path) => {
      const req = request[method](path);
      return user ? req.set(user.auth) : req;
    };
    return { get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
  };

  async function makeEvent(overrides = {}, { publish = true } = {}) {
    const start = overrides.startsAt
      ? new Date(overrides.startsAt)
      : new Date(Date.now() + 3 * 86400000);
    return strapi.documents(UID.event).create({
      data: {
        title: 'Budgeting basics workshop',
        description: 'Learn a simple way to plan your monthly budget.',
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 90 * 60000).toISOString(),
        eventType: 'financial_literacy',
        locationName: 'Hunter Hills Community Center',
        ...overrides,
      },
      ...(publish ? { status: 'published' } : {}),
    });
  }

  async function makeHousingResource(overrides = {}, { publish = true } = {}) {
    return strapi.documents(UID.housingResource).create({
      data: {
        title: 'Emergency rental assistance',
        category: 'rental_assistance',
        summary: 'Help paying past-due rent and utilities so you can stay in your home.',
        acceptsInquiries: true,
        inquiryAllowsAttachments: true,
        ...overrides,
      },
      ...(publish ? { status: 'published' } : {}),
    });
  }

  async function makeReport(reporter, overrides = {}) {
    return strapi.documents(UID.blightReport).create({
      data: {
        category: 'illegal_dumping',
        description: 'Tires dumped in the alley',
        latitude: 33.759,
        longitude: -84.425,
        status: 'submitted',
        reporter: reporter.profile.documentId,
        ...overrides,
      },
    });
  }

  async function close() {
    await teardownStrapi(strapi);
    await supabase.close();
  }

  return {
    strapi,
    supabase,
    request,
    as,
    makeUser,
    makeEvent,
    makeHousingResource,
    makeReport,
    close,
    UID,
    FIXTURES,
  };
}

module.exports = { createContext, UID, FIXTURES };
