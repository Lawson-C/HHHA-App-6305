import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipRow } from '@/components/ui/chip';
import { Appear } from '@/components/ui/appear';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { listReportsForModeration, updateReportStatus } from '@/lib/api/admin';
import type { BlightReport, BlightStatus } from '@/lib/api/types';
import { formatStamp } from '@/lib/format';
import { blightCategory, blightStatus } from '@/lib/labels';

type Filter = 'all' | BlightStatus;
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'New' },
  { value: 'under_review', label: 'Under review' },
  { value: 'reported_to_city', label: 'Sent to City' },
  { value: 'resolved', label: 'Resolved' },
];

const next: Partial<Record<BlightStatus, BlightStatus>> = {
  submitted: 'under_review',
  under_review: 'reported_to_city',
  reported_to_city: 'resolved',
};

/** Admin moderation of blight reports (docs/product.md F2, user story 3). */
export default function AdminReportsScreen() {
  const [filter, setFilter] = useState<Filter>('submitted');
  const client = useQueryClient();
  const reports = useQuery({
    queryKey: ['admin-reports', filter],
    queryFn: () => listReportsForModeration(filter === 'all' ? undefined : filter),
  });
  const update = useMutation({
    mutationFn: ({ report, status }: { report: BlightReport; status: BlightStatus }) =>
      updateReportStatus(report.documentId, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin-reports'] }),
  });

  const confirmRemove = (report: BlightReport) =>
    Alert.alert(
      'Remove this report?',
      'It disappears from the public map. It stays in the admin log.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => update.mutate({ report, status: 'removed' }),
        },
      ],
    );

  return (
    <Screen>
      <TopBar title="Reports" />
      <ChipRow options={filters} value={filter} onChange={setFilter} />
      {reports.isPending ? (
        <LoadingState />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
      ) : reports.data.length === 0 ? (
        <EmptyState title="Nothing to review" message="Reports in this status will show up here." />
      ) : (
        <Appear>
          {reports.data.map((r) => {
            const advance = next[r.status];
            return (
              <Card key={r.documentId} style={{ gap: 10 }}>
                <View style={styles.header}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    #{r.id} · {blightCategory[r.category].label}
                  </Text>
                  <Tag label={blightStatus[r.status].label} tone={blightStatus[r.status].tone} />
                </View>
                <Text variant="bodySmall" color="textSecondary">
                  {r.address ?? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`} ·{' '}
                  {formatStamp(r.createdAt)}
                </Text>
                {r.description ? <Text variant="body">{r.description}</Text> : null}
                <View style={styles.actions}>
                  {advance ? (
                    <Button
                      label={`Mark ${blightStatus[advance].label.toLowerCase()}`}
                      size="small"
                      loading={
                        update.isPending && update.variables?.report.documentId === r.documentId
                      }
                      onPress={() => update.mutate({ report: r, status: advance })}
                    />
                  ) : null}
                  {r.status !== 'removed' ? (
                    <Button
                      label="Remove"
                      size="small"
                      variant="outline"
                      onPress={() => confirmRemove(r)}
                    />
                  ) : null}
                </View>
              </Card>
            );
          })}
        </Appear>
      )}
      {update.isError ? (
        <Text variant="bodySmall" color="danger">
          {(update.error as Error).message}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
