import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { UID, docs } from '../../../utils/uids';
import { adminCrud } from '../../../services/admin-crud';
import { isIsoDate } from '../../../utils/validation';

const FIELDS = [
  'title',
  'description',
  'startsAt',
  'endsAt',
  'eventType',
  'locationName',
  'address',
  'costLabel',
  'costNote',
  'neighborhood',
];

export const serializeEvent = (event: any) => ({
  id: event.id,
  documentId: event.documentId,
  ...Object.fromEntries(FIELDS.map((key) => [key, event[key] ?? null])),
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  publishedAt: event.publishedAt ?? null,
});

const crud = adminCrud({
  uid: UID.event,
  fields: FIELDS,
  draftAndPublish: true,
  log: { create: 'event_created', update: 'event_updated', delete: 'event_deleted' },
  serialize: serializeEvent,
  validate(data, existing) {
    const startsAt = data.startsAt ?? existing?.startsAt;
    const endsAt = data.endsAt ?? existing?.endsAt;
    const fieldErrors = [];
    for (const key of ['startsAt', 'endsAt'] as const) {
      if (key in data && !isIsoDate(data[key])) {
        fieldErrors.push({
          path: [key],
          message: `${key} must be an ISO date`,
          name: 'ValidationError',
        });
      }
    }
    if (!fieldErrors.length && startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      fieldErrors.push({
        path: ['endsAt'],
        message: 'End time must be after the start time',
        name: 'ValidationError',
      });
    }
    if (fieldErrors.length) {
      throw new errors.ValidationError(fieldErrors[0].message, { errors: fieldErrors });
    }
  },
});

export default factories.createCoreController(UID.event as any, () => ({
  /** Published events, soonest first unless `sort` is given. Standard Strapi filters apply. */
  async find(ctx: any) {
    if (!ctx.query.sort) ctx.query.sort = ['startsAt:asc'];
    return super.find(ctx);
  },

  /** Event detail; signed-in callers also get `hasReminder` and `reminderId`. */
  async findOne(ctx: any) {
    const response: any = await super.findOne(ctx);
    if (!response?.data) throw new errors.NotFoundError('Not found');
    const profile = ctx.state.profile;
    if (response?.data && profile) {
      const reminder = await docs(UID.eventReminder).findFirst({
        filters: {
          profile: { documentId: profile.documentId },
          event: { documentId: response.data.documentId },
        },
        fields: ['documentId'],
      });
      response.data.hasReminder = !!reminder;
      response.data.reminderId = reminder?.documentId ?? null;
    }
    return response;
  },

  create: crud.create,
  update: crud.update,
  delete: crud.delete,
}));
