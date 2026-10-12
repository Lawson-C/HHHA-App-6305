import type { Core } from '@strapi/strapi';
import { createSupabaseStrategy } from './services/auth-strategy';
import { configurePermissions } from './services/permissions';
import { registerDocumentMiddleware } from './services/document-middleware';
import { syncEnvironment } from './services/environment-sync';

export default {
  /**
   * Runs before the app initializes.
   * - Supabase content-API auth strategy (Q-A): signed-in callers keep Public read access.
   * - Document Service middleware: invariants and admin-panel audit logging.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.get('auth').register('content-api', createSupabaseStrategy(strapi));
    registerDocumentMiddleware(strapi);
  },

  /**
   * Runs before the server starts.
   * - Public read permissions + users-permissions lockdown (idempotent).
   * - One environment sync at boot when a data source is enabled (never in tests).
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await configurePermissions(strapi);

    if (!strapi.config.get('supabase.url')) {
      strapi.log.warn(
        'SUPABASE_URL is not set: every request with a bearer token will get 401. See backend/.env.example.'
      );
    }

    const env = strapi.config.get('hhha.environment') as {
      syncEnabled: boolean;
      airnowApiKey: string;
    };
    if (process.env.NODE_ENV !== 'test' && (env.syncEnabled || env.airnowApiKey)) {
      syncEnvironment(strapi).catch((error) =>
        strapi.log.warn(`Initial environment sync failed: ${(error as Error).message}`),
      );
    }
  },
};
