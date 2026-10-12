import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, errors as joseErrors } from 'jose';
import type { JWTPayload } from 'jose';

export type SupabaseClaims = {
  sub: string;
  email: string | null;
  userMetadata: Record<string, unknown>;
};

export type SupabaseJwtConfig = {
  issuer: string;
  audience: string;
  jwksUrl: string;
  jwtSecret?: string;
};

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid or expired token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASYMMETRIC_ALGS = ['ES256', 'RS256'];
const CLOCK_TOLERANCE_SECONDS = 5;

// One cached JWKS per URL. jose caches keys and refetches when it sees an unknown `kid`.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const getJwks = (url: string) => {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url), { cacheMaxAge: 10 * 60 * 1000, timeoutDuration: 5000 });
    jwksCache.set(url, jwks);
  }
  return jwks;
};

/** Test hook: forget cached key sets (e.g. after rotating the test JWKS). */
export const resetJwksCache = () => jwksCache.clear();

/**
 * Verifies a Supabase access token. The algorithm is pinned from the header:
 * ES256/RS256 → JWKS; HS256 → shared secret, only when one is configured; anything else
 * (including `none`) is rejected. Always checks `iss`, `aud` and `exp`.
 */
export async function verifySupabaseJwt(
  token: string,
  config: SupabaseJwtConfig,
): Promise<SupabaseClaims> {
  if (!config.issuer) {
    throw new InvalidTokenError('Supabase auth is not configured');
  }

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new InvalidTokenError();
  }

  const options = {
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    requiredClaims: ['exp', 'sub'],
  };

  let payload: JWTPayload;
  try {
    if (alg && ASYMMETRIC_ALGS.includes(alg) && config.jwksUrl) {
      ({ payload } = await jwtVerify(token, getJwks(config.jwksUrl), {
        ...options,
        algorithms: [alg],
      }));
    } else if (alg === 'HS256' && config.jwtSecret) {
      const key = new TextEncoder().encode(config.jwtSecret);
      ({ payload } = await jwtVerify(token, key, { ...options, algorithms: ['HS256'] }));
    } else {
      throw new InvalidTokenError();
    }
  } catch (error) {
    if (error instanceof InvalidTokenError) throw error;
    // JWKS fetch failures also end up here: we answer 401 (decision Q-I), never anonymous.
    if (error instanceof joseErrors.JOSEError) throw new InvalidTokenError();
    throw new InvalidTokenError();
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!UUID_RE.test(sub)) {
    throw new InvalidTokenError();
  }

  const email = typeof payload.email === 'string' && payload.email ? payload.email : null;
  const meta = payload.user_metadata;
  const userMetadata =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};

  return { sub, email, userMetadata };
}
