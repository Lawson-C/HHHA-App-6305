import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  // Let the admin panel preview media served from Supabase Storage (S3 upload provider).
  const supabaseUrl = String(env('SUPABASE_URL', '')).replace(/\/+$/, '');
  const storageSources = env('SUPABASE_S3_BUCKET', '') && supabaseUrl ? [supabaseUrl] : [];

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...storageSources],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...storageSources],
          },
        },
      },
    },
    'strapi::cors',
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    // Verifies Supabase JWTs on /api/* and sets ctx.state.profile (docs/security.md).
    'global::supabase-auth',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};

export default config;
