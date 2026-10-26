import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  encodeSignatureHeader,
  sign,
  timingSafeEqual,
  verifySanitySignature,
} from '../_shared/sanity.ts';

const secret = 'test-webhook-secret';
const body = JSON.stringify({
  _id: 'alert-1',
  title: 'Hi',
  message: 'There',
  category: 'emergency',
});
const now = 1_790_000_000_000;

test('sign matches an independent HMAC-SHA256 base64url of "<t>.<body>"', async () => {
  const expected = createHmac('sha256', secret)
    .update(`${now}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.equal(await sign(body, secret, now), expected);
});

test('accepts a valid signature header', async () => {
  const header = await encodeSignatureHeader(body, secret, now);
  assert.match(header, /^t=\d+,v1=[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verifySanitySignature(body, header, secret, { now }), { valid: true });
});

test('accepts standard base64 (with padding) for the same signature', async () => {
  const b64 = createHmac('sha256', secret).update(`${now}.${body}`).digest('base64');
  assert.equal(
    (await verifySanitySignature(body, `t=${now},v1=${b64}`, secret, { now })).valid,
    true,
  );
});

test('rejects tampered bodies, wrong secrets, malformed and stale headers', async () => {
  const header = await encodeSignatureHeader(body, secret, now);
  assert.equal(
    (await verifySanitySignature(body.replace('Hi', 'Yo'), header, secret, { now })).valid,
    false,
  );
  assert.equal((await verifySanitySignature(body, header, 'other-secret', { now })).valid, false);
  assert.equal((await verifySanitySignature(body, null, secret, { now })).valid, false);
  assert.equal((await verifySanitySignature(body, 'v1=abc', secret, { now })).valid, false);
  assert.equal((await verifySanitySignature(body, `t=123,v1=abc`, secret, { now })).valid, false);
  assert.equal(
    (await verifySanitySignature(body, header, secret, { now: now + 2 * 24 * 60 * 60 * 1000 }))
      .valid,
    false,
  );
});

test('an unset secret never validates', async () => {
  const header = await encodeSignatureHeader(body, 'whatever', now);
  assert.equal((await verifySanitySignature(body, header, '', { now })).valid, false);
});

test('timingSafeEqual', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});
