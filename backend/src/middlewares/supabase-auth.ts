import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { verifySupabaseJwt, InvalidTokenError } from '../utils/supabase-jwt';
import { findOrCreateProfile } from '../services/profile-resolver';

/**
 * Identity bridge (docs/security.md). Only acts on the REST prefix (/api) so the admin
 * panel's own bearer tokens (/admin, /content-manager, /upload, ...) are untouched.
 *
 * - No Authorization header → anonymous request.
 * - Header present but malformed, or token invalid/expired → 401. Never anonymous.
 * - Valid token → ctx.state.profile (created on first use) and ctx.state.supabaseClaims.
 * Tokens are never logged.
 */
export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<unknown>) => {
    const prefix = (strapi.config.get('api.rest.prefix', '/api') as string) || '/api';
    const path: string = ctx.path || '';
    if (path !== prefix && !path.startsWith(`${prefix}/`)) {
      return next();
    }

    const header = ctx.request.header?.authorization;
    if (header === undefined || header === '') {
      return next();
    }

    const match = /^Bearer ([^\s]+)$/.exec(String(header));
    if (!match) {
      throw new errors.UnauthorizedError('Invalid or expired token');
    }

    let claims;
    try {
      claims = await verifySupabaseJwt(match[1], {
        issuer: strapi.config.get('supabase.issuer', '') as string,
        audience: strapi.config.get('supabase.audience', 'authenticated') as string,
        jwksUrl: strapi.config.get('supabase.jwksUrl', '') as string,
        jwtSecret: strapi.config.get('supabase.jwtSecret', '') as string,
      });
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw new errors.UnauthorizedError('Invalid or expired token');
      }
      throw error;
    }

    ctx.state.supabaseClaims = claims;
    ctx.state.profile = await findOrCreateProfile(claims);
    strapi.log.debug(`supabase-auth: resolved sub ${claims.sub}`);
    return next();
  };
};
