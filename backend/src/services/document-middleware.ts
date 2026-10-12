import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { UID, dbq } from '../utils/uids';
import { logAdminAction, diff, type AdminAction } from './activity-log';
import { deliverNotification } from './push';

const WRITE_ACTIONS = new Set([
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
  'discardDraft',
]);

/** The koa context of the current HTTP request, if any. */
const currentRequest = (strapi: Core.Strapi): any => (strapi as any).requestContext?.get?.();

/** True when the write comes from the Strapi admin panel (Content Manager). */
const fromAdminPanel = (ctx: any) =>
  typeof ctx?.request?.path === 'string' && ctx.request.path.startsWith('/content-manager/');

const panelActor = (ctx: any) =>
  ctx?.state?.user ? { adminUserId: ctx.state.user.id, adminUserEmail: ctx.state.user.email } : {};

/** Applies the server-owned blight fields whenever `status` changes, on every write path. */
export function applyBlightStatusChange(before: any, data: Record<string, any>, now = new Date()) {
  if (!data || data.status === undefined || data.status === before?.status) return data;
  const history = Array.isArray(before?.statusHistory) ? [...before.statusHistory] : [];
  history.push({ status: data.status, at: now.toISOString() });
  return {
    ...data,
    statusHistory: history,
    resolvedAt: data.status === 'resolved' ? now.toISOString() : (before?.resolvedAt ?? null),
  };
}

const isActiveAdmin = (profile: any) => profile?.role === 'admin' && profile?.status === 'active';

/** Last-admin invariant (data-model.md): at least one active admin must remain. */
async function assertAdminRemains(before: any, data: Record<string, any> | null) {
  if (!isActiveAdmin(before)) return;
  const after = data ? { ...before, ...data } : null;
  if (after && isActiveAdmin(after)) return;
  const others = await dbq(UID.profile).count({
    where: { role: 'admin', status: 'active', documentId: { $ne: before.documentId } },
  });
  if (others === 0) {
    throw new errors.ValidationError('At least one active admin must remain', {
      errors: [
        { path: ['role'], message: 'This is the last active admin', name: 'ValidationError' },
      ],
    });
  }
}

const PANEL_LOG: Record<string, (action: string) => AdminAction | null> = {
  [UID.event]: (action) =>
    action === 'create' ? 'event_created' : action === 'delete' ? 'event_deleted' : 'event_updated',
  [UID.housingResource]: () => 'housing_resource_changed',
  [UID.housingListing]: () => 'housing_resource_changed',
  [UID.libraryResource]: () => 'library_resource_changed',
};

/**
 * Document Service middleware. Rules that must hold no matter whether a write comes from our
 * REST controllers or from the Strapi admin panel:
 * - admin-activity-log is append-only;
 * - the last-admin invariant on profiles;
 * - blight statusHistory / resolvedAt are server-maintained;
 * - deleting or unpublishing an event removes its reminders;
 * - admin-panel writes are written to the activity log (REST controllers log themselves);
 * - a notification created in the admin panel is pushed like one sent from the app.
 */
export function registerDocumentMiddleware(strapi: Core.Strapi) {
  (strapi as any).documents.use(async (context: any, next: () => Promise<any>) => {
    const { uid, action } = context;
    if (!WRITE_ACTIONS.has(action)) return next();

    if (uid === UID.adminActivityLog && action !== 'create') {
      throw new errors.ForbiddenError('The admin activity log is append-only');
    }

    const params = context.params ?? {};
    const documentId: string | undefined = params.documentId;
    const ctx = currentRequest(strapi);
    const panel = fromAdminPanel(ctx);

    let before: any = null;
    if (documentId && (uid === UID.profile || uid === UID.blightReport || panel)) {
      before = await dbq(uid).findOne({ where: { documentId } });
    }

    if (uid === UID.profile && before) {
      if (action === 'delete') await assertAdminRemains(before, null);
      if (
        action === 'update' &&
        params.data &&
        ('role' in params.data || 'status' in params.data)
      ) {
        await assertAdminRemains(before, params.data);
      }
    }

    if (uid === UID.blightReport) {
      if (action === 'create' && params.data) {
        const status = params.data.status ?? 'submitted';
        params.data = {
          ...params.data,
          status,
          statusHistory: [{ status, at: new Date().toISOString() }],
        };
      } else if (action === 'update' && before && params.data) {
        params.data = applyBlightStatusChange(before, params.data);
      }
    }

    const result = await next();

    if (uid === UID.event && (action === 'delete' || action === 'unpublish') && documentId) {
      await dbq(UID.eventReminder).deleteMany({ where: { event: { documentId } } });
    }

    if (panel) {
      await logPanelWrite(strapi, ctx, uid, action, before, params, result);
    }
    return result;
  });
}

async function logPanelWrite(
  strapi: Core.Strapi,
  ctx: any,
  uid: string,
  action: string,
  before: any,
  params: any,
  result: any,
) {
  const targetId = params.documentId ?? result?.documentId ?? null;
  const details = { via: 'admin-panel', operation: action, ...panelActor(ctx) };

  if (PANEL_LOG[uid]) {
    const logAction = PANEL_LOG[uid](action);
    if (logAction) await logAdminAction({ action: logAction, targetType: uid, targetId, details });
    return;
  }

  if (uid === UID.blightReport && action === 'update' && before) {
    const status = params.data?.status;
    const changed = status !== undefined && status !== before.status;
    await logAdminAction({
      action: changed
        ? status === 'removed'
          ? 'report_removed'
          : 'report_status_changed'
        : 'report_edited',
      targetType: uid,
      targetId,
      details: {
        ...details,
        changes: diff(before, { ...before, ...params.data }, Object.keys(params.data ?? {})),
      },
    });
    return;
  }

  if (uid === UID.profile && action === 'update' && before && params.data) {
    const { role, status } = params.data;
    if (role !== undefined && role !== before.role) {
      await logAdminAction({
        action: role === 'admin' ? 'role_granted' : 'role_revoked',
        targetType: uid,
        targetId,
        details: { ...details, from: before.role, to: role },
      });
    }
    if (status !== undefined && status !== before.status) {
      const statusAction: AdminAction =
        status === 'banned'
          ? 'account_banned'
          : status === 'suspended'
            ? 'account_suspended'
            : 'account_reactivated';
      await logAdminAction({
        action: statusAction,
        targetType: uid,
        targetId,
        details: { ...details, from: before.status, to: status },
      });
    }
    return;
  }

  if (uid === UID.notification && action === 'create' && result?.documentId && !result.sentAt) {
    const { recipientCount } = await deliverNotification(strapi, result);
    await logAdminAction({
      action: 'notification_sent',
      targetType: uid,
      targetId: result.documentId,
      details: { ...details, category: result.category, recipientCount },
    });
  }
}
