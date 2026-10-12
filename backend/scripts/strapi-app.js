'use strict';

/**
 * Loads (but doesn't start) the Strapi app for CLI scripts: compiles TypeScript to dist/,
 * then registers + bootstraps against the database configured in backend/.env.
 * Cron jobs stay off so a script never triggers external fetches.
 */
const path = require('path');

async function loadStrapi() {
  process.env.CRON_ENABLED = 'false';
  const { compileStrapi, createStrapi } = require('@strapi/strapi');
  const appContext = await compileStrapi({ appDir: path.resolve(__dirname, '..') });
  const app = createStrapi(appContext);
  app.log.level = 'warn';
  await app.load();
  return app;
}

/** Requires a compiled module from dist/src (after loadStrapi compiled it). */
const fromDist = (relative) => require(path.resolve(__dirname, '..', 'dist', 'src', relative));

module.exports = { loadStrapi, fromDist };
