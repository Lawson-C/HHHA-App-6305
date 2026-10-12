'use strict';

const crypto = require('crypto');
const { SignJWT, UnsecuredJWT } = require('jose');
const { createContext } = require('./helpers/context');

let t;
beforeAll(async () => {
  t = await createContext();
});
afterAll(async () => {
  await t?.close();
});

const me = (header) => {
  const req = t.request.get('/api/me');
  return header === undefined ? req : req.set('Authorization', header);
};

describe('Supabase JWT verification (AC5)', () => {
  it('valid ES256 token → 200', async () => {
    expect((await me(`Bearer ${await t.supabase.signToken()}`)).status).toBe(200);
  });

  it('valid HS256 token when SUPABASE_JWT_SECRET is configured → 200', async () => {
    expect((await me(`Bearer ${await t.supabase.signToken({ alg: 'HS256' })}`)).status).toBe(200);
  });

  it.each([
    ['garbage token', 'Bearer not-a-jwt'],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['empty bearer', 'Bearer '],
    ['two tokens', 'Bearer a b'],
  ])('%s → 401', async (_label, header) => {
    const res = await me(header);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid or expired token');
  });

  it('token signed with an unknown key → 401', async () => {
    expect((await me(`Bearer ${await t.supabase.signToken({ wrongKey: true })}`)).status).toBe(401);
  });

  it('tampered payload → 401', async () => {
    const token = await t.supabase.signToken();
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    claims.sub = crypto.randomUUID();
    const forged = [
      header,
      Buffer.from(JSON.stringify(claims)).toString('base64url'),
      signature,
    ].join('.');
    expect((await me(`Bearer ${forged}`)).status).toBe(401);
  });

  it('expired token → 401', async () => {
    expect((await me(`Bearer ${await t.supabase.signToken({ expiresIn: -60 })}`)).status).toBe(401);
  });

  it('wrong issuer → 401', async () => {
    const token = await t.supabase.signToken({ iss: 'https://evil.example/auth/v1' });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it('wrong audience → 401', async () => {
    expect((await me(`Bearer ${await t.supabase.signToken({ aud: 'anon' })}`)).status).toBe(401);
  });

  it('alg "none" → 401', async () => {
    const token = new UnsecuredJWT({ email: 'x@example.test' })
      .setSubject(crypto.randomUUID())
      .setIssuer(`${t.supabase.url}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .encode();
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it('HS256 signed with a different secret → 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(crypto.randomUUID())
      .setIssuer(`${t.supabase.url}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode('some-other-secret'));
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  it('non-UUID sub → 401', async () => {
    expect((await me(`Bearer ${await t.supabase.signToken({ sub: 'not-a-uuid' })}`)).status).toBe(
      401,
    );
  });

  it('a bad token on a public route is still 401 (never silently anonymous)', async () => {
    const res = await t.request.get('/api/events').set('Authorization', 'Bearer junk');
    expect(res.status).toBe(401);
  });
});

describe('scope of the middleware', () => {
  it('does not touch admin-panel routes (junk bearer on /admin/init is not 401 from us)', async () => {
    const res = await t.request.get('/admin/init').set('Authorization', 'Bearer junk');
    expect(res.status).toBe(200);
  });

  it('public core routes work anonymously and with a valid Supabase token (Q-A strategy)', async () => {
    const anon = await t.request.get('/api/events');
    expect(anon.status).toBe(200);
    const user = await t.makeUser();
    const signedIn = await t.as(user).get('/api/events');
    expect(signedIn.status).toBe(200);
    // Even a suspended user keeps public read access.
    const suspended = await t.makeUser({ status: 'suspended' });
    expect((await t.as(suspended).get('/api/events')).status).toBe(200);
  });
});

describe('users-permissions lockdown (A8)', () => {
  it('self-registration and Strapi local login are not available to app users', async () => {
    const register = await t.request
      .post('/api/auth/local/register')
      .send({ username: 'x', email: 'x@example.test', password: 'password123' });
    expect([401, 403, 404]).toContain(register.status);
    const login = await t.request.post('/api/auth/local').send({ identifier: 'x', password: 'y' });
    expect([401, 403, 404]).toContain(login.status);
  });

  it('grants the Public role read access idempotently', async () => {
    const {
      configurePermissions,
      PUBLIC_READ_ACTIONS,
    } = require('../dist/src/services/permissions.js');
    await configurePermissions(t.strapi);
    await configurePermissions(t.strapi);
    const perms = await t.strapi.db
      .query('plugin::users-permissions.permission')
      .findMany({ where: { role: { type: 'public' } } });
    const actions = perms.map((p) => p.action);
    for (const action of PUBLIC_READ_ACTIONS) {
      expect(actions.filter((a) => a === action)).toHaveLength(1);
    }
    expect(actions.some((a) => a.startsWith('plugin::users-permissions.auth.'))).toBe(false);
  });

  it('allow_register is off', async () => {
    const advanced = await t.strapi
      .store({ type: 'plugin', name: 'users-permissions' })
      .get({ key: 'advanced' });
    expect(advanced.allow_register).toBe(false);
  });
});

describe('JWKS unavailable (Q-I)', () => {
  it('answers 401 (not anonymous) when keys cannot be fetched for an unknown kid', async () => {
    // jose caches the JWKS; a token from an unknown key forces a refetch, which fails.
    t.supabase.setJwksAvailable(false);
    try {
      const res = await me(`Bearer ${await t.supabase.signToken({ wrongKey: true })}`);
      expect(res.status).toBe(401);
    } finally {
      t.supabase.setJwksAvailable(true);
    }
  });
});
