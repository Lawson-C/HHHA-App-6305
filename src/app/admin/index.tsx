import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Camera, Megaphone } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Appear } from '@/components/ui/appear';
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
  inquiry_status_changed: 'Updated an inquiry',
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

/** Admin dashboard (docs/product.md F8, user story 1). Content and alerts are edited in the Sanity Studio. */
export default function AdminDashboard() {
  const summary = useQuery({ queryKey: ['admin-summary'], queryFn: getAdminSummary });
  const activity = useQuery({ queryKey: ['admin-activity'], queryFn: listAdminActivity });

  const stats = summary.data
    ? [
        { label: 'Reports to review', value: summary.data.pendingReports },
        { label: 'New inquiries', value: summary.data.newInquiries },
        { label: 'Open reports', value: summary.data.activeReports },
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
        <Appear>
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
        </Appear>
      )}

      <View style={{ gap: 10 }}>
        <ListRow
          icon={Camera}
          title="Review reports"
          subtitle="Update status, resolve or remove"
          onPress={() => router.push('/admin/reports')}
        />
        {env.sanityStudioUrl ? (
          <ListRow
            icon={Megaphone}
            title="Send alerts & edit content"
            subtitle="Alerts, events, housing, library (Sanity Studio)"
            onPress={() => WebBrowser.openBrowserAsync(env.sanityStudioUrl)}
          />
        ) : (
          <ListRow
            icon={Megaphone}
            title="Send alerts & edit content"
            subtitle="Publish alerts and content in the Sanity Studio. Publishing an alert sends the push."
          />
        )}
      </View>

      <SectionHeader title="Recent activity" />
      {activity.isPending ? (
        <LoadingState />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : (
        <Appear>
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
        </Appear>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2 },
});
