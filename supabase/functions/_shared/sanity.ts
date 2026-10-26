/**
 * Sanity GROQ-webhook signature verification (same scheme as @sanity/webhook):
 *   header `sanity-webhook-signature: t=<unix ms>,v1=<base64url(HMAC-SHA256(secret, "<t>.<raw body>"))>`
 * Uses WebCrypto only, so it runs in Deno and Node.
 */

export const SIGNATURE_HEADER = 'sanity-webhook-signature';
const HEADER_RE = /^t=(\d+)[, ]+v1=([^, ]+)$/;
/** Sanity timestamps are milliseconds; anything before 2021 is malformed (library parity). */
const MIN_TIMESTAMP_MS = 1609459200000;
/**
 * Re-deliveries are harmless (send-alert is idempotent on the alert id), so the window only
 * bounds very old captures; it is wide enough for Sanity's retry back-off.
 */
export const DEFAULT_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Accepts base64 or base64url; returns canonical base64url without padding. */
const normalizeBase64 = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sign(rawBody: string, secret: string, timestampMs: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestampMs}.${rawBody}`));
  return toBase64Url(new Uint8Array(signature));
}

export async function encodeSignatureHeader(rawBody: string, secret: string, timestampMs: number) {
  return `t=${timestampMs},v1=${await sign(rawBody, secret, timestampMs)}`;
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export type VerifyResult = { valid: true } | { valid: false; reason: string };

export async function verifySanitySignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  options: { now?: number; toleranceMs?: number } = {},
): Promise<VerifyResult> {
  if (!secret) return { valid: false, reason: 'webhook secret not configured' };
  const match = HEADER_RE.exec(String(header ?? '').trim());
  if (!match) return { valid: false, reason: 'missing or malformed signature header' };
  const timestamp = Number.parseInt(match[1], 10);
  if (!Number.isFinite(timestamp) || timestamp < MIN_TIMESTAMP_MS) {
    return { valid: false, reason: 'invalid signature timestamp' };
  }
  const now = options.now ?? Date.now();
  if (Math.abs(now - timestamp) > (options.toleranceMs ?? DEFAULT_TOLERANCE_MS)) {
    return { valid: false, reason: 'signature timestamp outside tolerance' };
  }
  const expected = await sign(rawBody, secret, timestamp);
  return timingSafeEqual(expected, normalizeBase64(match[2]))
    ? { valid: true }
    : { valid: false, reason: 'signature mismatch' };
}
