// Runs under `deno test supabase/functions/tests` and `node --test --experimental-strip-types`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BATCH_SIZE,
  buildAlertMessages,
  chunk,
  parseAlertPayload,
  sendExpoBatches,
  type PushMessage,
} from '../_shared/push.ts';

const token = (i: number) => `ExponentPushToken[device-${i}]`;

test('chunk splits into batches of at most the given size', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 100), []);
});

test('buildAlertMessages: app routing payload, priority and length limits', () => {
  const [emergency] = buildAlertMessages(
    { _id: 'alert-1', title: 'T'.repeat(80), message: 'M'.repeat(300), category: 'emergency' },
    [token(1)],
  );
  assert.equal(emergency.to, token(1));
  assert.equal(emergency.priority, 'high');
  assert.equal(emergency.sound, 'default');
  assert.deepEqual(emergency.data, {
    type: 'notification',
    documentId: 'alert-1',
    category: 'emergency',
  });
  assert.ok(emergency.title.length <= 65);
  assert.ok(emergency.body.length <= 240);

  const [health] = buildAlertMessages(
    { _id: 'alert-2', title: 'Boil water', message: 'Boil before use', category: 'health_warning' },
    [token(2)],
  );
  assert.equal(health.priority, 'default');
  assert.equal(health.title, 'Boil water');
});

test('sendExpoBatches: batches of 100, counts ok tickets, collects DeviceNotRegistered', async () => {
  const messages: PushMessage[] = Array.from({ length: 250 }, (_, i) => ({
    to: token(i),
    title: 't',
    body: 'b',
  }));
  const calls: { body: PushMessage[]; auth: string | null }[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as PushMessage[];
    calls.push({ body, auth: new Headers(init.headers).get('Authorization') });
    return new Response(
      JSON.stringify({
        data: body.map((m) =>
          m.to === token(7) || m.to === token(201)
            ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok', id: 'x' },
        ),
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const result = await sendExpoBatches(messages, { fetch: fakeFetch, accessToken: 'secret' });
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.body.length),
    [BATCH_SIZE, BATCH_SIZE, 50],
  );
  assert.equal(calls[0].auth, 'Bearer secret');
  assert.equal(result.attempted, 250);
  assert.equal(result.ok, 248);
  assert.deepEqual(result.deadTokens, [token(7), token(201)]);
  assert.equal(result.failedBatches, 0);
});

test('sendExpoBatches: a failing batch is counted and the rest still go out', async () => {
  let call = 0;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    call += 1;
    if (call === 1) return new Response('nope', { status: 500 });
    if (call === 2) throw new Error('network down');
    const body = JSON.parse(String(init.body)) as PushMessage[];
    return new Response(JSON.stringify({ data: body.map(() => ({ status: 'ok' })) }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
  const messages = Array.from({ length: 201 }, (_, i) => ({ to: token(i), title: 't', body: 'b' }));
  const result = await sendExpoBatches(messages, { fetch: fakeFetch });
  assert.equal(result.failedBatches, 2);
  assert.equal(result.ok, 1);
});

test('sendExpoBatches: no messages → no network', async () => {
  let called = false;
  const fakeFetch = (async () => {
    called = true;
    return new Response('{}');
  }) as unknown as typeof fetch;
  const result = await sendExpoBatches([], { fetch: fakeFetch });
  assert.equal(called, false);
  assert.equal(result.attempted, 0);
});

test('parseAlertPayload validates the webhook projection', () => {
  const good = parseAlertPayload({
    _id: 'abc',
    title: ' Boil water notice ',
    message: 'Boil before use',
    category: 'health_warning',
    endsAt: '2026-10-20T12:00:00Z',
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.alert.title, 'Boil water notice');
    assert.equal(good.alert.endsAt, '2026-10-20T12:00:00.000Z');
  }
  const noEnd = parseAlertPayload({
    _id: 'abc',
    title: 't',
    message: 'm',
    category: 'emergency',
    endsAt: null,
  });
  assert.equal(noEnd.ok && noEnd.alert.endsAt, null);

  assert.equal(parseAlertPayload(null).ok, false);
  assert.equal(
    parseAlertPayload({ _id: 'a', title: 't', message: 'm', category: 'spam' }).ok,
    false,
  );
  assert.equal(
    parseAlertPayload({ _id: '', title: 't', message: 'm', category: 'emergency' }).ok,
    false,
  );
  assert.equal(
    parseAlertPayload({ _id: 'a', title: ' ', message: 'm', category: 'emergency' }).ok,
    false,
  );
  assert.equal(
    parseAlertPayload({ _id: 'a', title: 't', message: 'm', category: 'emergency', endsAt: 'soon' })
      .ok,
    false,
  );
});
