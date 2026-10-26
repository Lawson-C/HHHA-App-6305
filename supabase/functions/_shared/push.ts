/**
 * Expo push helpers (port of backend/src/services/push.ts). Pure apart from the injected
 * `fetch`, so they run under `deno test` and `node --test`.
 */

export type AlertCategory =
  'emergency' | 'health_warning' | 'community_announcement' | 'meeting_reminder';

export const ALERT_CATEGORIES: readonly AlertCategory[] = [
  'emergency',
  'health_warning',
  'community_announcement',
  'meeting_reminder',
];

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
};

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const BATCH_SIZE = 100;
/** Expo/APNs limits used by the app's alert form. */
export const TITLE_MAX = 65;
export const BODY_MAX = 240;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

export type AlertInput = {
  _id: string;
  title: string;
  message: string;
  category: AlertCategory;
};

/** One message per token. The app routes on data.type === 'notification' (src/lib/push.ts). */
export function buildAlertMessages(alert: AlertInput, tokens: readonly string[]): PushMessage[] {
  return tokens.map((to) => ({
    to,
    title: clip(alert.title, TITLE_MAX),
    body: clip(alert.message, BODY_MAX),
    sound: 'default',
    priority: alert.category === 'emergency' ? 'high' : 'default',
    data: { type: 'notification', documentId: alert._id, category: alert.category },
  }));
}

export type SendResult = {
  attempted: number;
  ok: number;
  deadTokens: string[];
  failedBatches: number;
};

/**
 * POSTs messages to Expo in batches of ≤ 100 and collects tokens Expo reports as
 * DeviceNotRegistered (the caller deletes them). A failing batch is counted, not thrown, so one
 * bad batch doesn't stop the rest. Receipts are not polled (backend parity).
 */
export async function sendExpoBatches(
  messages: readonly PushMessage[],
  options: { fetch: typeof fetch; accessToken?: string; url?: string },
): Promise<SendResult> {
  let ok = 0;
  let failedBatches = 0;
  const deadTokens: string[] = [];
  for (const batch of chunk(messages, BATCH_SIZE)) {
    try {
      const response = await options.fetch(options.url ?? EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        failedBatches += 1;
        continue;
      }
      const payload = (await response.json()) as { data?: unknown };
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      tickets.forEach((ticket: any, index: number) => {
        if (ticket?.status === 'ok') ok += 1;
        else if (ticket?.details?.error === 'DeviceNotRegistered' && batch[index]) {
          deadTokens.push(batch[index].to);
        }
      });
    } catch {
      failedBatches += 1;
    }
  }
  return { attempted: messages.length, ok, deadTokens, failedBatches };
}

/** Validates the projection the Sanity webhook sends: { _id, title, message, category, endsAt? }. */
export function parseAlertPayload(
  body: unknown,
): { ok: true; alert: AlertInput & { endsAt: string | null } } | { ok: false; error: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const { _id, title, message, category, endsAt } = b;
  if (typeof _id !== 'string' || !_id || _id.length > 200)
    return { ok: false, error: '_id is required' };
  if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'title is required' };
  if (typeof message !== 'string' || !message.trim())
    return { ok: false, error: 'message is required' };
  if (typeof category !== 'string' || !ALERT_CATEGORIES.includes(category as AlertCategory)) {
    return { ok: false, error: 'category is invalid' };
  }
  let ends: string | null = null;
  if (endsAt !== undefined && endsAt !== null && endsAt !== '') {
    if (typeof endsAt !== 'string' || Number.isNaN(Date.parse(endsAt))) {
      return { ok: false, error: 'endsAt must be an ISO date' };
    }
    ends = new Date(endsAt).toISOString();
  }
  return {
    ok: true,
    alert: {
      _id,
      title: title.trim(),
      message: message.trim(),
      category: category as AlertCategory,
      endsAt: ends,
    },
  };
}
