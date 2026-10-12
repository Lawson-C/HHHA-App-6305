#!/usr/bin/env node
'use strict';

/**
 * Fills a development database with demo content (Figma prototype copy).
 *   npm run seed
 * Idempotent: records are matched by a natural key (title, key, ...) and updated in place,
 * so running it again refreshes dates instead of duplicating. Refuses to run in production.
 */
const { loadStrapi } = require('./strapi-app');
const data = require('./seed-data');

const UID = {
  profile: 'api::profile.profile',
  blightReport: 'api::blight-report.blight-report',
  event: 'api::event.event',
  housingResource: 'api::housing-resource.housing-resource',
  housingListing: 'api::housing-listing.housing-listing',
  notification: 'api::notification.notification',
  libraryResource: 'api::library-resource.library-resource',
  environmentalSource: 'api::environmental-source.environmental-source',
  environmentalReading: 'api::environmental-reading.environmental-reading',
};

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production. The seed script is for development only.');
  process.exit(1);
}

/** Create or update one document matched by `filters`. Returns [doc, 'created' | 'updated']. */
async function upsert(strapi, uid, filters, values, { publish = false } = {}) {
  const service = strapi.documents(uid);
  const status = publish ? { status: 'published' } : {};
  const existing = await service.findFirst({ filters, ...(publish ? { status: 'draft' } : {}) });
  if (existing) {
    return [
      await service.update({ documentId: existing.documentId, data: values, ...status }),
      'updated',
    ];
  }
  return [await service.create({ data: values, ...status }), 'created'];
}

async function seed(strapi) {
  if (strapi.config.get('environment') === 'production') {
    throw new Error('Refusing to seed a production environment.');
  }
  const now = new Date();
  const counts = {};
  const tally = (name, outcome) => {
    counts[name] = counts[name] || { created: 0, updated: 0 };
    counts[name][outcome] += 1;
  };

  const [profile, profileOutcome] = await upsert(
    strapi,
    UID.profile,
    { supabaseUserId: data.DEMO_PROFILE.supabaseUserId },
    data.DEMO_PROFILE,
  );
  tally('profile', profileOutcome);

  for (const alert of data.alerts(now)) {
    const [, outcome] = await upsert(
      strapi,
      UID.notification,
      { title: alert.title },
      { ...alert, recipientCount: 0 },
    );
    tally('notification', outcome);
  }
  for (const event of data.events(now)) {
    const [, outcome] = await upsert(strapi, UID.event, { title: event.title }, event, {
      publish: true,
    });
    tally('event', outcome);
  }
  for (const resource of data.housingResources) {
    const [, outcome] = await upsert(
      strapi,
      UID.housingResource,
      { title: resource.title },
      resource,
      { publish: true },
    );
    tally('housing-resource', outcome);
  }
  for (const listing of data.housingListings) {
    const [, outcome] = await upsert(
      strapi,
      UID.housingListing,
      { address: listing.address },
      listing,
      { publish: true },
    );
    tally('housing-listing', outcome);
  }
  for (const resource of data.libraryResources) {
    const [, outcome] = await upsert(
      strapi,
      UID.libraryResource,
      { title: resource.title },
      resource,
      { publish: true },
    );
    tally('library-resource', outcome);
  }

  for (const report of data.blightReports(now)) {
    const { createdAt, statusHistory, ...fields } = report;
    const [doc, outcome] = await upsert(
      strapi,
      UID.blightReport,
      { address: report.address, reporter: { documentId: profile.documentId } },
      { ...fields, reporter: profile.documentId },
    );
    // Server-maintained fields: write the demo history and dates directly.
    await strapi.db.query(UID.blightReport).update({
      where: { id: doc.id },
      data: { statusHistory, createdAt: new Date(createdAt) },
    });
    tally('blight-report', outcome);
  }

  const sources = {};
  for (const source of data.environmentalSources) {
    const [doc, outcome] = await upsert(
      strapi,
      UID.environmentalSource,
      { key: source.key },
      source,
    );
    sources[source.key] = doc;
    tally('environmental-source', outcome);
  }
  const centroid = strapi.config.get('hhha.district.centroid');
  for (const reading of data.environmentalReadings(now, centroid)) {
    const { source, ...fields } = reading;
    const [, outcome] = await upsert(
      strapi,
      UID.environmentalReading,
      {
        category: reading.category,
        summary: reading.summary,
        source: { documentId: sources[source].documentId },
      },
      { ...fields, source: sources[source].documentId },
    );
    tally('environmental-reading', outcome);
  }

  return counts;
}

if (require.main === module) {
  (async () => {
    let app;
    let code = 0;
    try {
      app = await loadStrapi();
      const counts = await seed(app);
      for (const [name, { created, updated }] of Object.entries(counts)) {
        console.log(`${name.padEnd(22)} created ${created}, updated ${updated}`);
      }
      console.log(
        'Seed complete. Demo profile "Denise Carter" is not a real Supabase user (it owns the demo reports).',
      );
    } catch (error) {
      console.error(`Seed failed: ${error.message}`);
      code = 1;
    } finally {
      if (app) await app.destroy();
      process.exit(code);
    }
  })();
}

module.exports = { seed };
