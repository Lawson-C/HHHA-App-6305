/** Event reminder helpers (port of backend/src/services/reminders.ts). Pure. */
import type { PushMessage } from './push.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Q-004 default: 24 h before the event; if that has passed, 1 h before; else right away.
 * (The database computes the same thing in public.default_remind_at.)
 */
export function defaultRemindAt(startsAt: string | Date, now = new Date()): Date {
  const start = new Date(startsAt).getTime();
  if (start - DAY_MS > now.getTime()) return new Date(start - DAY_MS);
  if (start - HOUR_MS > now.getTime()) return new Date(start - HOUR_MS);
  return now;
}

/** "Sat, Oct 24, 6:00 PM" in America/New_York. */
export const formatStart = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export type DueReminder = {
  reminder_id: string;
  user_id: string;
  event_id: string;
  event_title: string | null;
  event_starts_at: string;
  tokens: string[];
};

/** The app routes on data.type === 'event-reminder' (src/lib/push.ts). */
export function buildReminderMessages(reminder: DueReminder): PushMessage[] {
  const title = `Reminder: ${reminder.event_title?.trim() || 'Upcoming event'}`.slice(0, 65);
  return reminder.tokens.map((to) => ({
    to,
    title,
    body: `Starts ${formatStart(reminder.event_starts_at)}`,
    sound: 'default',
    data: { type: 'event-reminder', eventDocumentId: reminder.event_id },
  }));
}

export type SanityEvent = { _id: string; title?: string | null; startsAt?: string | null };

export type ReminderPlan =
  | { action: 'send'; reminder: DueReminder }
  | { action: 'delete'; reminderId: string }
  | { action: 'reschedule'; reminderId: string; startsAt: string }
  | { action: 'skip'; reminderId: string };

/**
 * Reconciles claimed reminders with the current Sanity events (when a lookup was possible):
 * - event gone (deleted/unpublished) → delete the reminder (backend middleware parity);
 * - start time moved by more than a minute → reschedule (the DB recomputes remind_at and
 *   clears sent_at) instead of sending now, or skip if the new time has already passed;
 * - otherwise send, using the fresh title.
 * With `events === null` (no Sanity config or lookup failed) everything is sent as stored.
 * Reminders whose event has already started are skipped (they stay claimed).
 */
export function planReminders(
  reminders: readonly DueReminder[],
  events: ReadonlyMap<string, SanityEvent> | null,
  now = new Date(),
): ReminderPlan[] {
  return reminders.map((reminder) => {
    // A reminder for an event that has already started is useless (e.g. claimed late after
    // push was off for a while): consume it silently.
    if (Date.parse(reminder.event_starts_at) <= now.getTime()) {
      return { action: 'skip', reminderId: reminder.reminder_id };
    }
    if (!events) return { action: 'send', reminder };
    const event = events.get(reminder.event_id);
    if (!event) return { action: 'delete', reminderId: reminder.reminder_id };
    const fresh = event.startsAt ? Date.parse(event.startsAt) : Number.NaN;
    if (
      Number.isFinite(fresh) &&
      Math.abs(fresh - Date.parse(reminder.event_starts_at)) > 60 * 1000
    ) {
      if (fresh <= now.getTime()) return { action: 'skip', reminderId: reminder.reminder_id };
      return {
        action: 'reschedule',
        reminderId: reminder.reminder_id,
        startsAt: new Date(fresh).toISOString(),
      };
    }
    return {
      action: 'send',
      reminder: { ...reminder, event_title: event.title?.trim() || reminder.event_title },
    };
  });
}
