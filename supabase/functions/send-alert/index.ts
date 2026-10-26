/**
 * send-alert: called by a Sanity GROQ webhook when an `alert` document is published.
 *
 * - Verifies `sanity-webhook-signature` with SANITY_WEBHOOK_SECRET (401 otherwise).
 * - Idempotent on the alert's Sanity _id (public.alert_deliveries): only the first delivery
 *   pushes; later calls just refresh title/ends_at.
 * - Recipients via public.alert_recipient_tokens (emergency → every token incl. guests; other
 *   categories → active accounts with the matching preference on).
 * - Pushes through Expo in batches of 100 only when PUSH_ENABLED=true; tokens reported as
 *   DeviceNotRegistered are deleted. Records the outcome and logs notification_sent.
 *
 * Webhook projection: { _id, title, message, category, endsAt }.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import { envFlag, json } from '../_shared/http.ts';
import { buildAlertMessages, parseAlertPayload, sendExpoBatches } from '../_shared/push.ts';
import { SIGNATURE_HEADER, verifySanitySignature } from '../_shared/sanity.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const rawBody = await req.text();
  const verified = await verifySanitySignature(
    rawBody,
    req.headers.get(SIGNATURE_HEADER),
    Deno.env.get('SANITY_WEBHOOK_SECRET') ?? '',
  );
  if (!verified.valid) return json(401, { error: 'Invalid signature' });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }
  const parsed = parseAlertPayload(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const alert = parsed.alert;
  // Drafts are never sent (the webhook filter should already exclude them).
  if (alert._id.startsWith('drafts.')) return json(202, { skipped: 'draft' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: isNew, error: claimError } = await supabase.rpc('claim_alert_delivery', {
    p_alert_id: alert._id,
    p_category: alert.category,
    p_title: alert.title,
    p_ends_at: alert.endsAt,
  });
  if (claimError) {
    console.error('claim_alert_delivery failed', claimError.message);
    return json(500, { error: 'Could not record the delivery' });
  }
  if (!isNew) return json(200, { alertId: alert._id, duplicate: true });

  const { data: tokenRows, error: tokenError } = await supabase.rpc('alert_recipient_tokens', {
    p_category: alert.category,
  });
  if (tokenError) {
    console.error('alert_recipient_tokens failed', tokenError.message);
    return json(500, { error: 'Could not select recipients' });
  }
  const tokens = (tokenRows ?? []) as string[];

  const pushEnabled = envFlag(Deno.env.get('PUSH_ENABLED'));
  let ok = 0;
  let removed = 0;
  if (pushEnabled && tokens.length > 0) {
    const result = await sendExpoBatches(buildAlertMessages(alert, tokens), {
      fetch,
      accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') || undefined,
    });
    ok = result.ok;
    if (result.deadTokens.length) {
      const { data, error } = await supabase.rpc('delete_push_tokens', {
        p_tokens: result.deadTokens,
      });
      if (error) console.error('delete_push_tokens failed', error.message);
      else removed = Number(data ?? 0);
    }
    if (result.failedBatches) console.warn(`Expo push: ${result.failedBatches} batch(es) failed`);
  }

  const { error: finishError } = await supabase.rpc('finish_alert_delivery', {
    p_alert_id: alert._id,
    p_recipient_count: tokens.length,
    p_ok_count: ok,
    p_removed_tokens: removed,
    p_pushed: pushEnabled,
  });
  if (finishError) console.error('finish_alert_delivery failed', finishError.message);

  return json(200, {
    alertId: alert._id,
    recipientCount: tokens.length,
    pushed: pushEnabled,
    ok,
    removedTokens: removed,
  });
});
