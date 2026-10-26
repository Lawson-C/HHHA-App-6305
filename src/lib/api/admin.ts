/**
 * Admin-only data (docs/product.md F8). Supabase rejects non-admins (RLS and `is_admin()`
 * checks in supabase/migrations/…_admin.sql). Content (alerts, events, housing, library) is
 * edited in the Sanity Studio, not here.
 */
import * as demo from '@/lib/api/mock-data';
import { fromReportRow, toApiError } from '@/lib/api/resident';
import type { BlightReport, BlightStatus } from '@/lib/api/types';
import { isDemoAuth } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export type AdminSummary = {
  pendingReports: number;
  newInquiries: number;
  activeReports: number;
  residents: number;
};

export type ActivityEntry = {
  documentId: string;
  action: string;
  targetType: string;
  createdAt: string;
  actor: { fullName: string } | null;
};

const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));

function db() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function getAdminSummary(): Promise<AdminSummary> {
  if (isDemoAuth) {
    await wait();
    return { pendingReports: 4, newInquiries: 2, activeReports: 9, residents: 128 };
  }
  const { data, error } = await db().rpc('admin_summary');
  if (error) throw toApiError(error);
  const s = data as {
    reports: { submitted: number; underReview: number; active: number };
    inquiries: { new: number };
    users: { residents: number };
  };
  return {
    pendingReports: s.reports.submitted + s.reports.underReview,
    newInquiries: s.inquiries.new,
    activeReports: s.reports.active,
    residents: s.users.residents,
  };
}

export async function listAdminActivity(): Promise<ActivityEntry[]> {
  if (isDemoAuth) {
    await wait();
    const now = Date.now();
    return [
      {
        documentId: 'a1',
        action: 'notification_sent',
        targetType: 'alert',
        createdAt: new Date(now - 600_000).toISOString(),
        actor: { fullName: 'Maya T.' },
      },
      {
        documentId: 'a2',
        action: 'report_status_changed',
        targetType: 'blight_report',
        createdAt: new Date(now - 7_200_000).toISOString(),
        actor: { fullName: 'Maya T.' },
      },
    ];
  }
  const { data, error } = await db()
    .from('admin_activity')
    .select('id, action, target_type, created_at, actor_full_name')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw toApiError(error);
  return (data ?? []).map((r) => ({
    documentId: String(r.id),
    action: r.action as string,
    targetType: r.target_type as string,
    createdAt: r.created_at as string,
    actor: r.actor_full_name ? { fullName: r.actor_full_name as string } : null,
  }));
}

/** Admins see every report status. */
export async function listReportsForModeration(status?: BlightStatus): Promise<BlightReport[]> {
  if (isDemoAuth) {
    await wait();
    return demo.myReports.filter((r) => !status || r.status === status);
  }
  let query = db()
    .from('blight_reports')
    .select(
      'id, category, description, latitude, longitude, address, status, status_history, created_at, blight_report_photos(storage_path)',
    )
    .order('created_at', { ascending: false })
    .limit(50);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw toApiError(error);
  return (data ?? []).map((row) => fromReportRow(row as Parameters<typeof fromReportRow>[0]));
}

export async function updateReportStatus(
  documentId: string,
  status: BlightStatus,
  resolutionNote?: string,
) {
  if (isDemoAuth) {
    await wait();
    return;
  }
  const patch: Record<string, unknown> = { status };
  if (resolutionNote !== undefined) patch.resolution_note = resolutionNote;
  const { error } = await db().from('blight_reports').update(patch).eq('id', Number(documentId));
  if (error) throw toApiError(error);
}
