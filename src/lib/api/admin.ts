/** Admin-only API calls (docs/api.md, rows marked A). The server rejects non-admins with 403. */
import { apiRequest } from '@/lib/api/client';
import * as demo from '@/lib/api/mock-data';
import type { AlertCategory, BlightReport, BlightStatus } from '@/lib/api/types';
import { isDemoData } from '@/lib/env';

export type AdminSummary = {
  pendingReports: number;
  newInquiries: number;
  activeAlerts: number;
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

export async function getAdminSummary(): Promise<AdminSummary> {
  if (isDemoData) {
    await wait();
    return {
      pendingReports: 4,
      newInquiries: 2,
      activeAlerts: demo.alerts.length - 1,
      residents: 128,
    };
  }
  return (await apiRequest<{ data: AdminSummary }>('/admin/summary')).data;
}

export async function listAdminActivity(): Promise<ActivityEntry[]> {
  if (isDemoData) {
    await wait();
    const now = Date.now();
    return [
      {
        documentId: 'a1',
        action: 'notification_sent',
        targetType: 'notification',
        createdAt: new Date(now - 600_000).toISOString(),
        actor: { fullName: 'Maya T.' },
      },
      {
        documentId: 'a2',
        action: 'report_status_changed',
        targetType: 'blight-report',
        createdAt: new Date(now - 7_200_000).toISOString(),
        actor: { fullName: 'Maya T.' },
      },
      {
        documentId: 'a3',
        action: 'event_created',
        targetType: 'event',
        createdAt: new Date(now - 86_400_000).toISOString(),
        actor: { fullName: 'Volunteer' },
      },
    ];
  }
  return (
    await apiRequest<{ data: ActivityEntry[] }>('/admin/activity', {
      query: { 'pagination[pageSize]': 20 },
    })
  ).data;
}

/** Admins see every report status. */
export async function listReportsForModeration(status?: BlightStatus): Promise<BlightReport[]> {
  if (isDemoData) {
    await wait();
    return demo.myReports.filter((r) => !status || r.status === status);
  }
  return (
    await apiRequest<{ data: BlightReport[] }>('/blight-reports', {
      query: { 'filters[status][$eq]': status, sort: 'createdAt:desc', 'pagination[pageSize]': 50 },
    })
  ).data;
}

export async function updateReportStatus(
  documentId: string,
  status: BlightStatus,
  resolutionNote?: string,
) {
  if (isDemoData) {
    await wait();
    return;
  }
  await apiRequest(`/blight-reports/${documentId}`, {
    method: 'PUT',
    body: { status, resolutionNote },
  });
}

export async function sendNotification(input: {
  title: string;
  message: string;
  category: AlertCategory;
}) {
  if (isDemoData) {
    await wait(600);
    return { recipientCount: 0 };
  }
  return (
    await apiRequest<{ data: { recipientCount: number } }>('/notifications', {
      method: 'POST',
      body: input,
    })
  ).data;
}
