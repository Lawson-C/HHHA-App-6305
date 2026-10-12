import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const publicAbility = async (strapi: Core.Strapi) => {
  const permissions = await strapi.db
    .query('plugin::users-permissions.permission')
    .findMany({ where: { role: { type: 'public' } } });
  return (strapi as any).contentAPI.permissions.engine.generateAbility(
    permissions.map((permission: { action: string }) => ({ action: permission.action })),
  );
};

/**
 * Content-API auth strategy for Supabase-authenticated callers (decision Q-A).
 *
 * Strapi's users-permissions strategy can't verify Supabase JWTs and would answer 401 on
 * public core routes when the app sends a token. This strategy runs after it: when our
 * middleware has resolved ctx.state.profile, the caller gets the **Public** role's
 * permissions. Elevated access never comes from here; it comes only from the global
 * is-authenticated / is-admin policies, which read profile.role from the database.
 */
export const createSupabaseStrategy = (strapi: Core.Strapi) => ({
  name: 'supabase',

  async authenticate(ctx: any) {
    const profile = ctx.state?.profile;
    if (!profile) {
      return { authenticated: false };
    }
    return { authenticated: true, credentials: profile, ability: await publicAbility(strapi) };
  },

  async verify(auth: any, config: { scope?: string | string[] } = {}) {
    if (!config.scope) {
      if (!auth.credentials) throw new errors.UnauthorizedError();
      return;
    }
    if (!auth.ability) throw new errors.UnauthorizedError();
    const scopes = Array.isArray(config.scope) ? config.scope : [config.scope];
    if (!scopes.every((scope) => auth.ability.can(scope))) {
      throw new errors.ForbiddenError();
    }
  },
});
