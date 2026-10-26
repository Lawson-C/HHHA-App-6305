import { createEventInCalendarAsync } from 'expo-calendar/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { Bell, BellRing, CalendarPlus, Clock, Info, MapPin, Share2 } from 'lucide-react-native';
import { Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { IconBadge } from '@/components/ui/icon-badge';
import { IconButton } from '@/components/ui/icon-button';
import { Appear } from '@/components/ui/appear';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Colors, Radius, Tones } from '@/constants/theme';
import { useEvent, useToggleReminder } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDayLong, formatTimeRange } from '@/lib/format';
import { eventIcon, eventType } from '@/lib/labels';

function directionsUrl(address: string) {
  const q = encodeURIComponent(address);
  return Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${q}` : `geo:0,0?q=${q}`;
}

/** Figma 03 · Event Detail */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data: event, isPending, isError, error, refetch } = useEvent(id);
  const toggle = useToggleReminder(event);

  const onRemind = () => {
    if (!session) {
      router.push('/sign-in');
      return;
    }
    toggle.mutate();
  };

  return (
    <Screen withTabBar>
      <TopBar
        title="Event"
        trailing={
          event ? (
            <IconButton
              icon={Share2}
              label="Share event"
              onPress={() =>
                Share.share({
                  message: `${event.title}, ${formatDayLong(event.startsAt)} ${formatTimeRange(event.startsAt, event.endsAt)}${event.locationName ? ` at ${event.locationName}` : ''}`,
                })
              }
            />
          ) : null
        }
      />
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Appear>
          <>
            <View
              style={[styles.hero, { backgroundColor: Tones[eventType[event.eventType].tone].bg }]}>
              <View style={styles.heroIcon}>
                {(() => {
                  const Icon = eventIcon[event.eventType];
                  return <Icon size={32} color={Tones[eventType[event.eventType].tone].fg} />;
                })()}
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <Text variant="display" accessibilityRole="header">
                {event.title}
              </Text>
              <Tag
                label={eventType[event.eventType].label}
                tone={eventType[event.eventType].tone}
              />
            </View>

            <Card padded={false}>
              <View style={styles.infoRow}>
                <IconBadge icon={Clock} size={40} />
                <View style={styles.infoText}>
                  <Text variant="bodyStrong">{formatDayLong(event.startsAt)}</Text>
                  <Text variant="bodySmall" color="textSecondary">
                    {formatTimeRange(event.startsAt, event.endsAt)}
                  </Text>
                </View>
              </View>
              {event.locationName || event.address ? (
                <>
                  <Divider inset={16} />
                  <View style={styles.infoRow}>
                    <IconBadge icon={MapPin} size={40} />
                    <View style={styles.infoText}>
                      <Text variant="bodyStrong">{event.locationName ?? event.address}</Text>
                      {event.address ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => Linking.openURL(directionsUrl(event.address!))}>
                          <Text variant="bodySmallStrong" color="textBrand">
                            Get directions
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </>
              ) : null}
              {event.costLabel ? (
                <>
                  <Divider inset={16} />
                  <View style={styles.infoRow}>
                    <IconBadge icon={Info} size={40} />
                    <View style={styles.infoText}>
                      <Text variant="bodyStrong">{event.costLabel}</Text>
                      {event.costNote ? (
                        <Text variant="bodySmall" color="textSecondary">
                          {event.costNote}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </>
              ) : null}
            </Card>

            <View style={{ gap: 8 }}>
              <Text variant="titleMedium" accessibilityRole="header">
                About
              </Text>
              <Text variant="bodyLarge">{event.description}</Text>
            </View>

            <View style={styles.actions}>
              <Button
                label={event.hasReminder ? 'Reminder set' : 'Remind me'}
                icon={event.hasReminder ? BellRing : Bell}
                variant={event.hasReminder ? 'secondary' : 'primary'}
                onPress={onRemind}
                loading={toggle.isPending}
                accessibilityHint={
                  event.hasReminder ? 'Removes the reminder' : 'We will notify you the day before'
                }
                style={styles.action}
              />
              <Button
                label="Add to calendar"
                icon={CalendarPlus}
                variant="secondary"
                style={styles.action}
                onPress={() =>
                  // System "new event" sheet; needs no calendar permission.
                  createEventInCalendarAsync({
                    title: event.title,
                    startDate: new Date(event.startsAt),
                    endDate: new Date(event.endsAt),
                    location: event.address ?? event.locationName ?? undefined,
                    notes: event.description,
                  }).catch(() => undefined)
                }
              />
            </View>
            {toggle.isError ? (
              <Text variant="bodySmall" color="danger">
                {(toggle.error as Error).message}
              </Text>
            ) : null}
          </>
        </Appear>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 150, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  infoText: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  action: { flexGrow: 1 },
});
