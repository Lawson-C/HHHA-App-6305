import { UID, docs } from '../utils/uids';

export type AdminAction =
  | 'role_granted'
  | 'role_revoked'
  | 'account_suspended'
  | 'account_banned'
  | 'account_reactivated'
  | 'report_status_changed'
  | 'report_edited'
  | 'report_removed'
  | 'event_created'
  | 'event_updated'
  | 'event_deleted'
  | 'housing_resource_changed'
  | 'library_resource_changed'
  | 'notification_sent'
  | 'data_exported';

/** Appends one admin-activity-log entry. `actor` is a profile documentId (null for panel users). */
export async function logAdminAction(entry: {
  actor?: string | null;
  action: AdminAction;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await docs(UID.adminActivityLog).create({
      data: {
        actor: entry.actor ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        details: entry.details ?? {},
      },
    });
  } catch (error) {
    // The audited action already happened; don't fail the request, but make the gap visible.
    strapi.log.error(
      `admin-activity-log write failed (${entry.action}): ${(error as Error).message}`,
    );
  }
}

/** Shallow before/after diff of the keys that changed. */
export function diff(before: Record<string, any>, after: Record<string, any>, keys: string[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return changes;
}
