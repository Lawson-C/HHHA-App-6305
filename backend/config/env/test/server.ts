import os from 'os';
import path from 'path';
import type { Core } from '@strapi/strapi';

// Keep test uploads out of backend/public/uploads.
const config = (): Partial<Core.Config.Server> => ({
  cron: { enabled: false },
  dirs: { public: path.join(os.tmpdir(), 'hhha-strapi-test-public') },
});

export default config;
