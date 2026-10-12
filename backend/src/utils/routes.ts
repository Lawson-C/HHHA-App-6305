type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Route builders. Our identity comes from the Supabase middleware (ctx.state.profile), so
 * custom routes use `auth: false` and enforce access with the global policies.
 * `scoped` routes keep Strapi's permission check (the Public role grants read access; the
 * `supabase` auth strategy gives signed-in users the same Public permissions).
 */
export const route = {
  scoped: (method: Method, path: string, handler: string) => ({ method, path, handler }),
  public: (method: Method, path: string, handler: string) => ({
    method,
    path,
    handler,
    config: { auth: false as const },
  }),
  resident: (method: Method, path: string, handler: string) => ({
    method,
    path,
    handler,
    config: { auth: false as const, policies: ['global::is-authenticated'] },
  }),
  admin: (method: Method, path: string, handler: string) => ({
    method,
    path,
    handler,
    config: { auth: false as const, policies: ['global::is-admin'] },
  }),
};
