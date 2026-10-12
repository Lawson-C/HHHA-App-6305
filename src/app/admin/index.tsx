import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Camera, ExternalLink, Megaphone } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { getAdminSummary, listAdminActivity } from '@/lib/api/admin';
import { env } from '@/lib/env';
import { formatRelative } from '@/lib/format';

const actionLabels: Record<string, string> = {
  notification_sent: 'Sent an alert',
  report_status_changed: 'Updated a report',
  report_edited: 'Edited a report',
  report_removed: 'Removed a report',
  event_created: 'Added an event',
  event_updated: 'Updated an event',
  event_deleted: 'Deleted an event',
  role_granted: 'Made someone an admin',
  role_revoked: 'Removed an admin',
  account_suspended: 'Suspended an account',
  account_banned: 'Banned an account',
  account_reactivated: 'Reactivated an account',
  housing_resource_changed: 'Changed a housing program',
  library_resource_changed: 'Changed a library item',
  data_exported: 'Exported data',
};

/** Admin dashboard (docs/product.md F8, user story 1). Content editing lives in the Strapi admin panel. */
export default function AdminDashboard() {
  const summary = useQuery({ queryKey: ['admin-summary'], queryFn: getAdminSummary });
  const activity = useQuery({ queryKey: ['admin-activity'], queryFn: listAdminActivity });

  const stats = summary.data
    ? [
        { label: 'Reports to review', value: summary.data.pendingReports },
        { label: 'New inquiries', value: summary.data.newInquiries },
        { label: 'Active alerts', value: summary.data.activeAlerts },
        { label: 'Residents', value: summary.data.residents },
      ]
    : [];

  return (
    <Screen>
      <TopBar title="Admin" />
      <Text variant="titleLarge" accessibilityRole="header">
        Dashboard
      </Text>
      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <View style={styles.grid}>
          {stats.map((s) => (
            <Card key={s.label} style={styles.stat}>
              <Text variant="titleLarge" color="textBrand">
                {s.value}
              </Text>
              <Text variant="bodySmall" color="textSecondary">
                {s.label}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        <ListRow
          icon={Camera}
          title="Review reports"
          subtitle="Update status, resolve or remove"
          onPress={() => router.push('/admin/reports')}
        />
        <ListRow
          icon={Megaphone}
          title="Send an alert"
          subtitle="Push to residents by category"
          onPress={() => router.push('/admin/send-alert')}
        />
        {env.apiUrl ? (
          <ListRow
            icon={ExternalLink}
            title="Edit content"
            subtitle="Events, housing, library (Strapi admin)"
            onPress={() => WebBrowser.openBrowserAsync(`${env.apiUrl}/admin`)}
          />
        ) : null}
      </View>

      <SectionHeader title="Recent activity" />
      {activity.isPending ? (
        <LoadingState />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : (
        <Card padded={false}>
          {activity.data.map((a) => (
            <ListRow
              key={a.documentId}
              standalone={false}
              title={actionLabels[a.action] ?? a.action}
              subtitle={`${a.actor?.fullName ?? 'Admin'} · ${formatRelative(a.createdAt)}`}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2 },
});
