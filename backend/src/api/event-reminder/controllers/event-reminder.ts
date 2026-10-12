import { errors } from '@strapi/utils';
import { UID, docs } from '../../../utils/uids';
import { readBodyData } from '../../../utils/validation';
import { defaultRemindAt } from '../../../services/reminders';

const EVENT_FIELDS = ['documentId', 'title', 'startsAt', 'endsAt', 'locationName'];

const serialize = (reminder: any) => ({
  documentId: reminder.documentId,
  remindAt: reminder.remindAt ?? null,
  sentAt: reminder.sentAt ?? null,
  createdAt: reminder.createdAt,
  event: reminder.event
    ? Object.fromEntries(EVENT_FIELDS.map((key) => [key, reminder.event[key] ?? null]))
    : null,
});

// Serializes reminder creation per (profile, event) inside this process (unique pair).
const locks = new Map<string, Promise<unknown>>();

export default {
  /** The caller's reminders, soonest event first. */
  async find(ctx: any) {
    const reminders = await docs(UID.eventReminder).findMany({
      filters: { profile: { documentId: ctx.state.profile.documentId } },
      populate: { event: { fields: EVENT_FIELDS } },
      sort: [{ remindAt: 'asc' }],
      limit: 200,
    });
    return { data: reminders.filter((r: any) => r.event).map(serialize) };
  },

  /** POST { data: { event: documentId } } → 201, or 409 when the reminder already exists. */
  async create(ctx: any) {
    const body = readBodyData(ctx);
    const eventId = typeof body.event === 'string' ? body.event : '';
    if (!eventId) {
      throw new errors.ValidationError('event is required', {
        errors: [{ path: ['event'], message: 'event is required', name: 'ValidationError' }],
      });
    }
    const event = await docs(UID.event).findOne({ documentId: eventId, status: 'published' });
    if (!event) throw new errors.NotFoundError('Event not found');

    const profileId = ctx.state.profile.documentId;
    const key = `${profileId}:${eventId}`;
    const previous = locks.get(key) ?? Promise.resolve();
    const run = previous.then(async () => {
      const existing = await docs(UID.eventReminder).findFirst({
        filters: { profile: { documentId: profileId }, event: { documentId: eventId } },
      });
      if (existing) return null;
      return docs(UID.eventReminder).create({
        data: {
          profile: profileId,
          event: eventId,
          remindAt: defaultRemindAt(event.startsAt).toISOString(),
        },
        populate: { event: { fields: EVENT_FIELDS } },
      });
    });
    const tail = run.catch(() => undefined);
    locks.set(key, tail);
    const created = await run.finally(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });

    if (!created) {
      return ctx.conflict('You already have a reminder for this event');
    }
    ctx.status = 201;
    return { data: serialize(created) };
  },

  /** Only the owner can delete; anyone else gets 404. */
  async delete(ctx: any) {
    const reminder = await docs(UID.eventReminder).findFirst({
      filters: {
        documentId: ctx.params.documentId,
        profile: { documentId: ctx.state.profile.documentId },
      },
    });
    if (!reminder) throw new errors.NotFoundError('Reminder not found');
    await docs(UID.eventReminder).delete({ documentId: reminder.documentId });
    ctx.status = 204;
    ctx.body = null;
  },
};
