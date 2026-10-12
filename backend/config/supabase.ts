import type { Core } from '@strapi/strapi';

/**
 * Supabase Auth settings used by the identity bridge (src/middlewares/supabase-auth.ts).
 * Read in code with strapi.config.get('supabase.<key>').
 */
const config = ({ env }: Core.Config.Shared.ConfigParams) => {
  const url = (env('SUPABASE_URL', '') as string).replace(/\/+$/, '');
  return {
    url,
    // Expected `iss` claim. Supabase issues `<SUPABASE_URL>/auth/v1`.
    issuer: url ? `${url}/auth/v1` : '',
    // Asymmetric signing keys (ES256 / RS256). Defaults to the project's JWKS endpoint.
    jwksUrl: env('SUPABASE_JWKS_URL', url ? `${url}/auth/v1/.well-known/jwks.json` : ''),
    // Legacy HS256 shared secret. Optional: HS256 tokens are rejected unless this is set.
    jwtSecret: env('SUPABASE_JWT_SECRET', ''),
    audience: env('SUPABASE_JWT_AUDIENCE', 'authenticated'),
  };
};

export default config;
