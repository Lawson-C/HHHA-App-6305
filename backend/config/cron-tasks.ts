import type { Core } from '@strapi/strapi';
import { syncEnvironment, pruneReadings } from '../src/services/environment-sync';
import { sendDueReminders } from '../src/services/reminders';

/**
 * Cron tasks (enabled through config/server.ts). Each task checks its own feature flag,
 * so nothing reaches the network unless the matching env var is set.
 */
export default {
  environmentSync: {
    task: async ({ strapi }: { strapi: Core.Strapi }) => {
      await syncEnvironment(strapi);
    },
    options: { rule: '*/30 * * * *' },
  },
  pruneEnvironmentReadings: {
    task: async ({ strapi }: { strapi: Core.Strapi }) => {
      await pruneReadings(strapi);
    },
    options: { rule: '15 3 * * *' },
  },
  eventReminders: {
    task: async ({ strapi }: { strapi: Core.Strapi }) => {
      await sendDueReminders(strapi);
    },
    options: { rule: '*/5 * * * *' },
  },
};
