import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AlertRow } from '@/components/alert-row';
import { ChipRow } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import type { AlertFilter } from '@/lib/api';
import { useAlerts } from '@/lib/api/queries';
import type { Alert } from '@/lib/api/types';

const filters: { value: AlertFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'health', label: 'Health' },
  { value: 'community', label: 'Community' },
];

function groupByRecency(alerts: Alert[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = alerts.filter((a) => new Date(a.sentAt) >= startOfToday);
  const earlier = alerts.filter((a) => new Date(a.sentAt) < startOfToday);
  return [
    { title: 'Today', items: today },
    { title: 'Earlier this week', items: earlier },
  ].filter((g) => g.items.length);
}

/** Figma 02 · Alerts */
export default function AlertsScreen() {
  const [filter, setFilter] = useState<AlertFilter>('all');
  const alerts = useAlerts(filter);

  return (
    <Screen withTabBar refreshing={alerts.isRefetching} onRefresh={() => alerts.refetch()}>
      <TopBar title="Alerts" />
      <ChipRow options={filters} value={filter} onChange={setFilter} />
      {alerts.isPending ? (
        <LoadingState />
      ) : alerts.isError ? (
        <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
      ) : alerts.data.length === 0 ? (
        <EmptyState title="No alerts here" message="Nothing has been sent in this category." />
      ) : (
        groupByRecency(alerts.data).map((group) => (
          <View key={group.title} style={styles.group}>
            <Text variant="bodySmallStrong" color="textSecondary">
              {group.title}
            </Text>
            {group.items.map((alert) => (
              <AlertRow key={alert.documentId} alert={alert} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: 12 } });
