import os from 'os';
import path from 'path';
import type { Core } from '@strapi/strapi';

// Tests use a throwaway SQLite file per test file (tests/strapi.js sets TEST_DATABASE_FILENAME
// and deletes it afterwards). Strapi resolves the filename to a path, so ':memory:' can't be used.
const config = (): Core.Config.Database => ({
  connection: {
    client: 'sqlite',
    connection: {
      filename:
        process.env.TEST_DATABASE_FILENAME || path.join(os.tmpdir(), `hhha-test-${process.pid}.db`),
    },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  },
});

export default config;
