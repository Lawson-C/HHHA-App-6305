import { errors } from '@strapi/utils';
import { UID, docs } from '../../../utils/uids';
import {
  Validator,
  isIsoDate,
  paginationMeta,
  parsePagination,
  readBodyData,
} from '../../../utils/validation';
import { logAdminAction, type AdminAction } from '../../../services/activity-log';

const serializeUser = (profile: any) => ({
  documentId: profile.documentId,
  fullName: profile.fullName,
  email: profile.email ?? null,
  phone: profile.phone ?? null,
  role: profile.role,
  status: profile.status,
  suspendedUntil: profile.suspendedUntil ?? null,
  neighborhood: profile.neighborhood ?? null,
  lastSeenAt: profile.lastSeenAt ?? null,
  createdAt: profile.createdAt,
});

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Neutralize spreadsheet formulas (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (columns: string[], rows: Record<string, unknown>[]) =>
  [columns.join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))].join(
    '\n',
  ) + '\n';

/** Q-007 default: report/inquiry fields without personal contact details. */
const EXPORTS: Record<
  string,
  { columns: string[]; load: () => Promise<Record<string, unknown>[]> }
> = {
  'blight-reports': {
    columns: [
      'id',
      'documentId',
      'category',
      'status',
      'latitude',
      'longitude',
      'address',
      'description',
      'createdAt',
      'resolvedAt',
    ],
    load: () => docs(UID.blightReport).findMany({ sort: [{ createdAt: 'asc' }], limit: 100000 }),
  },
  'housing-inquiries': {
    columns: [
      'documentId',
      'resourceTitle',
      'resourceCategory',
      'status',
      'preferredContact',
      'createdAt',
    ],
    load: async () =>
      (
        await docs(UID.housingInquiry).findMany({
          sort: [{ createdAt: 'asc' }],
          populate: { housingResource: { fields: ['title', 'category'] } },
          limit: 100000,
        })
      ).map((inquiry: any) => ({
        ...inquiry,
        resourceTitle: inquiry.housingResource?.title ?? null,
        resourceCategory: inquiry.housingResource?.category ?? null,
      })),
  },
};

async function findProfile(documentId: string) {
  const profile = await docs(UID.profile).findOne({ documentId });
  if (!profile) throw new errors.NotFoundError('User not found');
  return profile;
}

export default {
  /** GET /api/admin/users?q=&pagination[page]=: search by name or email. */
  async users(ctx: any) {
    const q = typeof ctx.query.q === 'string' ? ctx.query.q.trim().slice(0, 100) : '';
    const { page, pageSize, start } = parsePagination(ctx.query);
    const filters = q
      ? { $or: [{ fullName: { $containsi: q } }, { email: { $containsi: q } }] }
      : {};
    const [results, total] = await Promise.all([
      docs(UID.profile).findMany({ filters, sort: [{ fullName: 'asc' }], start, limit: pageSize }),
      docs(UID.profile).count({ filters }),
    ]);
    return { data: results.map(serializeUser), meta: paginationMeta(page, pageSize, total) };
  },

  /** PUT /api/admin/users/:documentId/role { role }. Last-admin invariant → 400. */
  async setRole(ctx: any) {
    const body = readBodyData(ctx);
    if (!['resident', 'admin'].includes(body.role as string)) {
      throw new errors.ValidationError('role must be resident or admin', {
        errors: [
          { path: ['role'], message: 'role must be resident or admin', name: 'ValidationError' },
        ],
      });
    }
    const profile = await findProfile(ctx.params.documentId);
    if (profile.role === body.role) return { data: serializeUser(profile) };
    const updated = await docs(UID.profile).update({
      documentId: profile.documentId,
      data: { role: body.role },
    });
    await logAdminAction({
      actor: ctx.state.profile.documentId,
      action: body.role === 'admin' ? 'role_granted' : 'role_revoked',
      targetType: UID.profile,
      targetId: profile.documentId,
      details: { from: profile.role, to: body.role },
    });
    return { data: serializeUser(updated) };
  },

  /** PUT /api/admin/users/:documentId/status { status, suspendedUntil? }. */
  async setStatus(ctx: any) {
    const body = readBodyData(ctx);
    const v = new Validator();
    if (!['active', 'suspended', 'banned'].includes(body.status as string)) {
      v.add('status', 'status must be active, suspended or banned');
    }
    if (body.suspendedUntil !== undefined && body.suspendedUntil !== null) {
      if (!isIsoDate(body.suspendedUntil))
        v.add('suspendedUntil', 'suspendedUntil must be an ISO date');
      else if (body.status !== 'suspended')
        v.add('suspendedUntil', 'suspendedUntil only applies to suspended');
    }
    v.throwIfAny();
    if (ctx.params.documentId === ctx.state.profile.documentId && body.status !== 'active') {
      throw new errors.ValidationError("You can't suspend or ban your own account");
    }
    const profile = await findProfile(ctx.params.documentId);
    const data = {
      status: body.status,
      suspendedUntil:
        body.status === 'suspended' ? ((body.suspendedUntil as string) ?? null) : null,
    };
    const updated = await docs(UID.profile).update({ documentId: profile.documentId, data });
    if (profile.status !== body.status || profile.suspendedUntil !== data.suspendedUntil) {
      const action: AdminAction =
        body.status === 'banned'
          ? 'account_banned'
          : body.status === 'suspended'
            ? 'account_suspended'
            : 'account_reactivated';
      await logAdminAction({
        actor: ctx.state.profile.documentId,
        action,
        targetType: UID.profile,
        targetId: profile.documentId,
        details: { from: profile.status, to: body.status, suspendedUntil: data.suspendedUntil },
      });
    }
    return { data: serializeUser(updated) };
  },

  /** GET /api/admin/summary: dashboard counts. */
  async summary() {
    const now = new Date().toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const count = (
      uid: any,
      filters: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ) => docs(uid).count({ filters, ...extra });
    const [
      submittedReports,
      underReviewReports,
      activeReports,
      newInquiries,
      openInquiries,
      upcomingEvents,
      residents,
      admins,
      suspendedOrBanned,
      notificationsLast30Days,
    ] = await Promise.all([
      count(UID.blightReport, { status: 'submitted' }),
      count(UID.blightReport, { status: 'under_review' }),
      count(UID.blightReport, {
        status: { $in: ['submitted', 'under_review', 'reported_to_city'] },
      }),
      count(UID.housingInquiry, { status: 'new' }),
      count(UID.housingInquiry, { status: { $in: ['new', 'in_progress'] } }),
      count(UID.event, { startsAt: { $gte: now } }, { status: 'published' }),
      count(UID.profile, { role: 'resident' }),
      count(UID.profile, { role: 'admin' }),
      count(UID.profile, { status: { $in: ['suspended', 'banned'] } }),
      count(UID.notification, { sentAt: { $gte: monthAgo } }),
    ]);
    return {
      data: {
        reports: {
          submitted: submittedReports,
          underReview: underReviewReports,
          active: activeReports,
        },
        inquiries: { new: newInquiries, open: openInquiries },
        events: { upcoming: upcomingEvents },
        users: { residents, admins, suspendedOrBanned },
        notifications: { sentLast30Days: notificationsLast30Days },
      },
    };
  },

  /** GET /api/admin/activity: newest first, paginated. Read-only (append-only log). */
  async activity(ctx: any) {
    const { page, pageSize, start } = parsePagination(ctx.query);
    const [results, total] = await Promise.all([
      docs(UID.adminActivityLog).findMany({
        sort: [{ createdAt: 'desc' }, { id: 'desc' }],
        populate: { actor: { fields: ['documentId', 'fullName'] } },
        start,
        limit: pageSize,
      }),
      docs(UID.adminActivityLog).count({}),
    ]);
    return {
      data: results.map((entry: any) => ({
        documentId: entry.documentId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details ?? {},
        actor: entry.actor
          ? { documentId: entry.actor.documentId, fullName: entry.actor.fullName }
          : null,
        createdAt: entry.createdAt,
      })),
      meta: paginationMeta(page, pageSize, total),
    };
  },

  /** GET /api/admin/export/:type.csv, type ∈ blight-reports | housing-inquiries. Logged. */
  async exportCsv(ctx: any) {
    const match = /^([a-z-]+)\.csv$/.exec(String(ctx.params.file ?? ''));
    const spec = match ? EXPORTS[match[1]] : undefined;
    if (!match || !spec) throw new errors.NotFoundError('Unknown export');
    const rows = await spec.load();
    await logAdminAction({
      actor: ctx.state.profile.documentId,
      action: 'data_exported',
      targetType: match[1],
      details: { rows: rows.length, columns: spec.columns },
    });
    ctx.set('Content-Type', 'text/csv; charset=utf-8');
    ctx.set(
      'Content-Disposition',
      `attachment; filename="${match[1]}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    ctx.body = toCsv(spec.columns, rows);
  },
};
