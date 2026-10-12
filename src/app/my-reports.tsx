import { StyleSheet, View } from 'react-native';

import { ReportProgress } from '@/components/report-progress';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { useMyReports } from '@/lib/api/queries';
import { formatStamp } from '@/lib/format';
import { blightCategory, blightStatus } from '@/lib/labels';

/** The signed-in resident's own blight reports, all statuses. */
export default function MyReportsScreen() {
  const reports = useMyReports();
  return (
    <Screen refreshing={reports.isRefetching} onRefresh={() => reports.refetch()}>
      <TopBar title="My reports" />
      {reports.isPending ? (
        <LoadingState />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
      ) : reports.data.length === 0 ? (
        <EmptyState
          title="No reports yet"
          message="Use the Report button to tell us about a problem."
        />
      ) : (
        reports.data.map((r) => (
          <Card key={r.documentId} style={{ gap: 12 }}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">
                  {blightCategory[r.category].label} · #{r.id}
                </Text>
                <Text variant="bodySmall" color="textSecondary">
                  {r.address ?? 'Location saved'} · {formatStamp(r.createdAt)}
                </Text>
              </View>
              <Tag label={blightStatus[r.status].label} tone={blightStatus[r.status].tone} />
            </View>
            {r.status !== 'removed' ? <ReportProgress report={r} /> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
