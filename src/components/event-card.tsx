import { router } from 'expo-router';
import { Clock, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { Colors, Radius } from '@/constants/theme';
import type { CommunityEvent } from '@/lib/api/types';
import { formatDayNumber, formatMonthShort, formatTimeRange } from '@/lib/format';
import { eventType } from '@/lib/labels';

/** Figma "Event Card": date block, title, type tag, time and place. */
export function EventCard({ event }: { event: CommunityEvent }) {
  const type = eventType[event.eventType];
  return (
    <Card
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.documentId } })}
      style={styles.card}
      accessibilityLabel={`${event.title}, ${type.label}, ${formatTimeRange(event.startsAt, event.endsAt)}${event.locationName ? `, ${event.locationName}` : ''}`}>
      <View style={styles.date}>
        <Text variant="bodySmallStrong" color="textBrand">
          {formatMonthShort(event.startsAt)}
        </Text>
        <Text variant="titleMedium" color="textBrand">
          {formatDayNumber(event.startsAt)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" style={styles.title}>
          {event.title}
        </Text>
        <Tag label={type.label} tone={type.tone} />
        <View style={styles.meta}>
          <Clock size={16} color={Colors.textSecondary} />
          <Text variant="bodySmall" color="textSecondary">
            {formatTimeRange(event.startsAt, event.endsAt)}
          </Text>
        </View>
        {event.locationName ? (
          <View style={styles.meta}>
            <MapPin size={16} color={Colors.textSecondary} />
            <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>
              {event.locationName}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14 },
  date: {
    width: 56,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgBrandFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 6 },
  title: { fontSize: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
