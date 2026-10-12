import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalendarMonth, keyFor } from '@/components/calendar-month';
import { EventCard } from '@/components/event-card';
import { ChipRow } from '@/components/ui/chip';
import { PageTitle } from '@/components/ui/page-title';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useEvents } from '@/lib/api/queries';
import type { EventType } from '@/lib/api/types';
import { dayKey, formatDayShort } from '@/lib/format';
import { eventType } from '@/lib/labels';

type Filter = 'all' | EventType;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(
    [
      'workforce_development',
      'financial_literacy',
      'wellness',
      'civic_meeting',
      'community_gathering',
    ] as const
  ).map((t) => ({ value: t, label: eventType[t].label })),
];

/** Figma 03 · Events */
export default function EventsScreen() {
  const today = new Date();
  const todayKey = keyFor(today.getFullYear(), today.getMonth(), today.getDate());
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [filter, setFilter] = useState<Filter>('all');
  const types = useMemo(() => (filter === 'all' ? [] : [filter]), [filter]);
  const events = useEvents(month, types);

  const byDay = useMemo(() => {
    const map = new Map<string, EventType[]>();
    for (const e of events.data ?? []) {
      const key = dayKey(e.startsAt);
      map.set(key, [...(map.get(key) ?? []), e.eventType]);
    }
    return map;
  }, [events.data]);

  const dayEvents = (events.data ?? []).filter((e) => dayKey(e.startsAt) === selectedKey);

  const changeMonth = (next: Date) => {
    setMonth(next);
    // Select today when returning to this month, otherwise the 1st.
    const isCurrent =
      next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth();
    setSelectedKey(isCurrent ? todayKey : keyFor(next.getFullYear(), next.getMonth(), 1));
  };

  const [y, m, d] = selectedKey.split('-').map(Number);
  const selectedDate = new Date(y!, m! - 1, d!);

  return (
    <Screen withTabBar refreshing={events.isRefetching} onRefresh={() => events.refetch()}>
      <PageTitle title="Events" />
      <ChipRow options={filters} value={filter} onChange={setFilter} />
      <CalendarMonth
        month={month}
        onMonthChange={changeMonth}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        todayKey={todayKey}
        markers={byDay}
      />
      <Text variant="titleMedium" accessibilityRole="header">
        {formatDayShort(selectedDate.toISOString())}
      </Text>
      {events.isPending ? (
        <LoadingState />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : dayEvents.length === 0 ? (
        <EmptyState
          title="No events this day"
          message={
            byDay.size
              ? 'Days with a colored line have events.'
              : 'Nothing is scheduled this month yet.'
          }
        />
      ) : (
        <View style={styles.list}>
          {dayEvents.map((e) => (
            <EventCard key={e.documentId} event={e} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: 12 } });
