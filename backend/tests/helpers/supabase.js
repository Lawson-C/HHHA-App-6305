'use strict';

const http = require('http');
const crypto = require('crypto');
const { SignJWT, exportJWK, generateKeyPair } = require('jose');

/**
 * A fake Supabase Auth: an ES256 key pair, a JWKS endpoint on 127.0.0.1:<random port>, and
 * a token signer. Configures SUPABASE_URL / SUPABASE_JWT_SECRET for Strapi before it boots.
 */
async function startFakeSupabase() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const other = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const hsSecret = crypto.randomBytes(32).toString('hex');

  let jwksAvailable = true;
  const server = http.createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json' && jwksAvailable) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(jwksAvailable ? 404 : 503);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_JWT_SECRET = hsSecret;
  delete process.env.SUPABASE_JWKS_URL;

  /**
   * Signs a token. Options: sub, email, metadata, expiresIn (seconds, negative = expired),
   * iss, aud, alg ('ES256' | 'HS256'), wrongKey (sign with an unknown key).
   */
  async function signToken(options = {}) {
    const {
      sub = crypto.randomUUID(),
      email = `${sub.slice(0, 8)}@example.test`,
      metadata = {},
      expiresIn = 3600,
      iss = `${url}/auth/v1`,
      aud = 'authenticated',
      alg = 'ES256',
      wrongKey = false,
    } = options;
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({ email, user_metadata: metadata, role: 'authenticated' })
      .setProtectedHeader(
        alg === 'HS256' ? { alg, typ: 'JWT' } : { alg, kid: 'test-key', typ: 'JWT' },
      )
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setIssuer(iss)
      .setAudience(aud);
    if (alg === 'HS256') return jwt.sign(new TextEncoder().encode(hsSecret));
    return jwt.sign(wrongKey ? other.privateKey : privateKey);
  }

  return {
    url,
    signToken,
    setJwksAvailable(value) {
      jwksAvailable = value;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startFakeSupabase };
