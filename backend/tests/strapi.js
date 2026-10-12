'use strict';

/**
 * Test harness (adapted from the Strapi 5 testing guide): boots Strapi from dist/ (compiled
 * once in global-setup.js) against a throwaway SQLite file, with a fake Supabase JWKS.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');

function testEnv() {
  process.env.NODE_ENV = 'test';
  // Don't read backend/.env: tests must not depend on (or leak) a developer's settings.
  process.env.ENV_PATH = path.join(__dirname, '.env.does-not-exist');
  Object.assign(process.env, {
    APP_KEYS: 'testKeyOne,testKeyTwo',
    API_TOKEN_SALT: 'test-api-token-salt',
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret',
    TRANSFER_TOKEN_SALT: 'test-transfer-token-salt',
    JWT_SECRET: 'test-jwt-secret',
    ENCRYPTION_KEY: 'test-encryption-key-0123456789ab',
    DATABASE_CLIENT: 'sqlite',
    PUSH_ENABLED: 'false',
    ENVIRONMENT_SYNC_ENABLED: 'false',
    AIRNOW_API_KEY: '',
    STRAPI_TELEMETRY_DISABLED: 'true',
    BROWSER: 'false',
  });
}

/** Routes that only exist in tests (Q-B): exercise the global policies directly. */
const TEST_ROUTES = [
  {
    method: 'GET',
    path: '/__test/admin-only',
    handler: (ctx) => {
      ctx.body = { data: { ok: true } };
    },
    config: { auth: false, policies: ['global::is-admin'] },
  },
  {
    method: 'GET',
    path: '/__test/signed-in',
    handler: (ctx) => {
      ctx.body = { data: { ok: true } };
    },
    config: { auth: false, policies: ['global::is-authenticated'] },
  },
];

let dbFile;

async function setupStrapi() {
  testEnv();
  dbFile = path.join(
    os.tmpdir(),
    `hhha-test-${process.pid}-${crypto.randomBytes(6).toString('hex')}.db`,
  );
  process.env.TEST_DATABASE_FILENAME = dbFile;
  // Must match config/env/test/server.ts (dirs.public); the local upload provider needs it.
  fs.mkdirSync(path.join(os.tmpdir(), 'hhha-strapi-test-public', 'uploads'), { recursive: true });
  const { createStrapi } = require('@strapi/strapi');
  const instance = createStrapi({ appDir: APP_DIR, distDir: path.join(APP_DIR, 'dist') });
  await instance.load();
  instance.server.routes({ type: 'content-api', routes: TEST_ROUTES });
  instance.server.mount();
  // Listen once on a random port so supertest reuses it instead of re-listening per request.
  await new Promise((resolve) => instance.server.httpServer.listen(0, '127.0.0.1', resolve));
  return instance;
}

async function teardownStrapi(instance) {
  if (instance) await instance.destroy();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
}

module.exports = { setupStrapi, teardownStrapi };
