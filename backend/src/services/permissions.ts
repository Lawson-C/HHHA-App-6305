import type { Core } from '@strapi/strapi';

/** Public (guest) read access for the published content collections. */
export const PUBLIC_READ_ACTIONS = [
  'api::event.event.find',
  'api::event.event.findOne',
  'api::housing-resource.housing-resource.find',
  'api::housing-resource.housing-resource.findOne',
  'api::housing-listing.housing-listing.find',
  'api::housing-listing.housing-listing.findOne',
  'api::library-resource.library-resource.find',
  'api::library-resource.library-resource.findOne',
  'api::notification.notification.find',
  'api::notification.notification.findOne',
];

const PERMISSION_UID = 'plugin::users-permissions.permission';

/**
 * Idempotent bootstrap step:
 * - grants the Public role read access to public collections;
 * - locks down users-permissions (A8): no self-registration and no Strapi auth endpoints for
 *   app users (they authenticate with Supabase).
 */
export async function configurePermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });
  if (!publicRole) {
    strapi.log.warn('users-permissions Public role not found; skipping permission setup');
    return;
  }

  const existing = await strapi.db
    .query(PERMISSION_UID)
    .findMany({ where: { role: publicRole.id } });
  const have = new Set(existing.map((permission: { action: string }) => permission.action));

  for (const action of PUBLIC_READ_ACTIONS) {
    if (!have.has(action)) {
      await strapi.db.query(PERMISSION_UID).create({ data: { action, role: publicRole.id } });
    }
  }

  const authActions = existing.filter((permission: { action: string }) =>
    permission.action.startsWith('plugin::users-permissions.auth.'),
  );
  if (authActions.length) {
    await strapi.db
      .query(PERMISSION_UID)
      .deleteMany({ where: { id: { $in: authActions.map((p: { id: number }) => p.id) } } });
  }

  const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
  const advanced = ((await store.get({ key: 'advanced' })) as Record<string, unknown>) ?? {};
  if (advanced.allow_register !== false) {
    await store.set({ key: 'advanced', value: { ...advanced, allow_register: false } });
  }
}
