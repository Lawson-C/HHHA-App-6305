import type { Core } from '@strapi/strapi';
import { UID, dbq, docs } from '../utils/uids';
import { sendPushMessages } from './push';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Default reminder time (Q-004 default): 24 h before the event. If that has already passed,
 * 1 h before; if that has passed too, right away.
 */
export function defaultRemindAt(startsAt: string | Date, now = new Date()): Date {
  const start = new Date(startsAt).getTime();
  if (start - DAY_MS > now.getTime()) return new Date(start - DAY_MS);
  if (start - HOUR_MS > now.getTime()) return new Date(start - HOUR_MS);
  return now;
}

const formatStart = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** Cron: sends due reminders once. Does nothing while push is disabled. */
export async function sendDueReminders(strapi: Core.Strapi, now = new Date()) {
  if (!strapi.config.get('hhha.push.enabled', false)) return { sent: 0 };

  const due = await docs(UID.eventReminder).findMany({
    filters: { remindAt: { $lte: now.toISOString() }, sentAt: { $null: true } },
    populate: { event: { fields: ['title', 'startsAt'] }, profile: { fields: ['documentId'] } },
    limit: 500,
  });

  let sent = 0;
  for (const reminder of due) {
    if (!reminder.event || !reminder.profile) continue;
    const tokens = await dbq(UID.pushToken).findMany({
      where: { profile: { documentId: reminder.profile.documentId } },
      select: ['token'],
    });
    await sendPushMessages(
      strapi,
      tokens.map((row: { token: string }) => ({
        to: row.token,
        title: `Reminder: ${reminder.event.title}`.slice(0, 65),
        body: `Starts ${formatStart(reminder.event.startsAt)}`,
        sound: 'default' as const,
        data: { type: 'event-reminder', eventDocumentId: reminder.event.documentId },
      })),
    );
    await docs(UID.eventReminder).update({
      documentId: reminder.documentId,
      data: { sentAt: now.toISOString() },
    });
    sent += 1;
  }
  return { sent };
}
