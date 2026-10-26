/**
 * send-reminders: pg_cron every 5 minutes (x-cron-secret). Claims due event reminders
 * atomically (public.claim_due_event_reminders), reconciles them with Sanity when
 * SANITY_PROJECT_ID is set (deleted event → reminder removed, moved event → rescheduled), and
 * pushes { type: 'event-reminder', eventDocumentId } to the owner's devices.
 * No-op unless PUSH_ENABLED=true.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import { envFlag, isCronAuthorized, json } from '../_shared/http.ts';
import { sendExpoBatches } from '../_shared/push.ts';
import {
  buildReminderMessages,
  planReminders,
  type DueReminder,
  type SanityEvent,
} from '../_shared/reminders.ts';

/** Current published events by id, or null when not configured / the lookup failed. */
async function fetchSanityEvents(ids: string[]): Promise<Map<string, SanityEvent> | null> {
  const projectId = Deno.env.get('SANITY_PROJECT_ID');
  if (!projectId || ids.length === 0) return null;
  const dataset = Deno.env.get('SANITY_DATASET') || 'production';
  const apiVersion = Deno.env.get('SANITY_API_VERSION') || '2026-10-19';
  const query = '*[_type == "event" && _id in $ids]{_id, title, startsAt}';
  const url = new URL(`https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`);
  url.searchParams.set('query', query);
  url.searchParams.set('$ids', JSON.stringify(ids));
  url.searchParams.set('perspective', 'published');
  const token = Deno.env.get('SANITY_READ_TOKEN');
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: SanityEvent[] };
    if (!Array.isArray(payload.result)) throw new Error('unexpected response');
    return new Map(payload.result.map((event) => [event._id, event]));
  } catch (error) {
    console.warn(
      'Sanity event lookup failed; sending reminders as stored:',
      (error as Error).message,
    );
    return null;
  }
}

Deno.serve(async (req) => {
  if (!isCronAuthorized(req, Deno.env.get('CRON_SECRET')))
    return json(401, { error: 'Unauthorized' });
  if (!envFlag(Deno.env.get('PUSH_ENABLED')))
    return json(200, { sent: 0, skipped: 'PUSH_ENABLED is off' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc('claim_due_event_reminders', { p_limit: 500 });
  if (error) {
    console.error('claim_due_event_reminders failed', error.message);
    return json(500, { error: 'Could not load reminders' });
  }
  const due = (data ?? []) as DueReminder[];
  if (due.length === 0) return json(200, { sent: 0 });

  const events = await fetchSanityEvents([...new Set(due.map((r) => r.event_id))]);
  const plans = planReminders(due, events);

  const toDelete = plans.flatMap((p) => (p.action === 'delete' ? [p.reminderId] : []));
  if (toDelete.length) {
    const { error: deleteError } = await supabase
      .from('event_reminders')
      .delete()
      .in('id', toDelete);
    if (deleteError) console.error('deleting reminders failed', deleteError.message);
  }
  for (const plan of plans) {
    if (plan.action !== 'reschedule') continue;
    // The table trigger recomputes remind_at and clears sent_at.
    const { error: updateError } = await supabase
      .from('event_reminders')
      .update({ event_starts_at: plan.startsAt })
      .eq('id', plan.reminderId);
    if (updateError) console.error('rescheduling reminder failed', updateError.message);
  }

  const messages = plans.flatMap((p) =>
    p.action === 'send' ? buildReminderMessages(p.reminder) : [],
  );
  const result = await sendExpoBatches(messages, {
    fetch,
    accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') || undefined,
  });
  if (result.deadTokens.length) {
    const { error: tokenError } = await supabase.rpc('delete_push_tokens', {
      p_tokens: result.deadTokens,
    });
    if (tokenError) console.error('delete_push_tokens failed', tokenError.message);
  }

  return json(200, {
    sent: plans.filter((p) => p.action === 'send').length,
    deleted: toDelete.length,
    rescheduled: plans.filter((p) => p.action === 'reschedule').length,
    messages: result.attempted,
    ok: result.ok,
  });
});
