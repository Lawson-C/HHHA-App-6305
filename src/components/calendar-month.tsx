import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Colors, Tones } from '@/constants/theme';
import type { EventType } from '@/lib/api/types';
import { formatMonthTitle } from '@/lib/format';
import { eventType } from '@/lib/labels';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');
export const keyFor = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

type Props = {
  month: Date;
  onMonthChange: (month: Date) => void;
  selectedKey: string;
  onSelect: (key: string) => void;
  todayKey: string;
  /** Event types per day key, drawn as colored dashes under the date. */
  markers: Map<string, EventType[]>;
};

/** Month grid from Figma 03 · Events. Days with events get category-colored dashes. */
export function CalendarMonth({
  month,
  onMonthChange,
  selectedKey,
  onSelect,
  todayKey,
  markers,
}: Props) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const shift = (delta: number) => onMonthChange(new Date(year, monthIndex + delta, 1));
  const legendTypes: EventType[] = [
    'workforce_development',
    'financial_literacy',
    'wellness',
    'civic_meeting',
    'community_gathering',
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="titleMedium" accessibilityRole="header" accessibilityLiveRegion="polite">
          {formatMonthTitle(month)}
        </Text>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => shift(-1)}
            style={styles.navButton}>
            <ChevronLeft size={20} color={Colors.textPrimary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => shift(1)}
            style={styles.navButton}>
            <ChevronRight size={20} color={Colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((d) => (
          <Text key={d} variant="bodySmallStrong" color="textSecondary" style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
            if (!day) return <View key={`e${i}`} style={styles.cell} />;
            const key = keyFor(year, monthIndex, day);
            const selected = key === selectedKey;
            const today = key === todayKey;
            const types = markers.get(key) ?? [];
            const unique = [...new Set(types)].slice(0, 3);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${day}${types.length ? `, ${types.length} event${types.length > 1 ? 's' : ''}` : ''}`}
                onPress={() => onSelect(key)}
                style={styles.cell}>
                <View style={[styles.day, today && styles.today, selected && styles.selected]}>
                  <Text
                    variant={selected || today ? 'bodyStrong' : 'body'}
                    color={selected ? 'textOnBrand' : 'textPrimary'}>
                    {day}
                  </Text>
                </View>
                <View style={styles.markers}>
                  {unique.map((t) => (
                    <View
                      key={t}
                      style={[styles.marker, { backgroundColor: Tones[eventType[t].tone].fg }]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        {legendTypes.map((t) => (
          <View key={t} style={styles.legendItem}>
            <View
              style={[
                styles.marker,
                styles.legendMarker,
                { backgroundColor: Tones[eventType[t].tone].fg },
              ]}
            />
            <Text variant="bodySmall" color="textSecondary">
              {eventType[t].shortLabel}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nav: { flexDirection: 'row', gap: 8 },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', marginBottom: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 50 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: Colors.borderBrand },
  selected: { backgroundColor: Colors.bgBrand, borderColor: Colors.bgBrand },
  markers: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  marker: { width: 10, height: 3, borderRadius: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendMarker: { width: 14 },
});
