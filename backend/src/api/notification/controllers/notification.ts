import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { UID, docs } from '../../../utils/uids';
import { Validator, cleanText, isIsoDate, readBodyData } from '../../../utils/validation';
import { deliverNotification } from '../../../services/push';
import { logAdminAction } from '../../../services/activity-log';

const CATEGORIES = ['emergency', 'health_warning', 'community_announcement', 'meeting_reminder'];

const withDefaults = (alert: any) =>
  alert && { ...alert, actionSteps: Array.isArray(alert.actionSteps) ? alert.actionSteps : [] };

export default factories.createCoreController(UID.notification as any, () => ({
  /** Sent alerts only, newest first unless `sort` is given. Filter with filters[category]. */
  async find(ctx: any) {
    const userFilters = ctx.query.filters;
    ctx.query.filters = userFilters
      ? { $and: [userFilters, { sentAt: { $notNull: true } }] }
      : { sentAt: { $notNull: true } };
    if (!ctx.query.sort) ctx.query.sort = ['sentAt:desc'];
    const response: any = await super.find(ctx);
    return { ...response, data: response.data.map(withDefaults) };
  },

  async findOne(ctx: any) {
    const response: any = await super.findOne(ctx);
    if (!response?.data || !response.data.sentAt) throw new errors.NotFoundError('Not found');
    return { ...response, data: withDefaults(response.data) };
  },

  /**
   * POST /api/notifications (admin): stores the alert with sentBy = caller and sentAt = now,
   * pushes it (opted-in users; emergency → every registered device) and returns it with
   * `recipientCount`.
   */
  async create(ctx: any) {
    const body = readBodyData(ctx);
    const v = new Validator();
    const title = cleanText(body.title);
    const message = cleanText(body.message);
    if (!title || title.length > 65) v.add('title', 'Title is required (65 characters max)');
    if (!message || message.length > 240)
      v.add('message', 'Message is required (240 characters max)');
    if (!CATEGORIES.includes(body.category as string)) v.add('category', 'Choose a category');
    if (body.actionSteps !== undefined && body.actionSteps !== null) {
      const ok =
        Array.isArray(body.actionSteps) &&
        body.actionSteps.length <= 10 &&
        body.actionSteps.every((step) => typeof step === 'string' && step.length <= 300);
      if (!ok) v.add('actionSteps', 'actionSteps must be a list of up to 10 short strings');
    }
    if (body.endsAt !== undefined && body.endsAt !== null && !isIsoDate(body.endsAt)) {
      v.add('endsAt', 'endsAt must be an ISO date');
    }
    v.throwIfAny();

    const created = await docs(UID.notification).create({
      data: {
        title,
        message,
        category: body.category,
        issuer: body.issuer == null ? null : cleanText(body.issuer).slice(0, 255),
        body: body.body == null ? null : cleanText(body.body),
        actionSteps: Array.isArray(body.actionSteps) ? body.actionSteps.map(cleanText) : [],
        affectedArea: body.affectedArea == null ? null : cleanText(body.affectedArea),
        endsAt: body.endsAt ?? null,
        sentBy: ctx.state.profile.documentId,
        sentAt: new Date().toISOString(),
      },
    });
    const { recipientCount, notification } = await deliverNotification(strapi, created);
    await logAdminAction({
      actor: ctx.state.profile.documentId,
      action: 'notification_sent',
      targetType: UID.notification,
      targetId: created.documentId,
      details: { category: created.category, title, recipientCount },
    });

    ctx.status = 201;
    const { sentBy: _sentBy, ...data } = notification;
    return { data: { ...withDefaults(data), recipientCount } };
  },
}));
