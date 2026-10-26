import { router } from 'expo-router';
import { Bell, CalendarDays, Camera, HouseHeart, Leaf, BookOpen } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AlertRow } from '@/components/alert-row';
import { FeatureTile } from '@/components/feature-tile';
import { NeighborhoodCard } from '@/components/neighborhood-card';
import { IconButton } from '@/components/ui/icon-button';
import { Logo } from '@/components/ui/logo';
import { Appear } from '@/components/ui/appear';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { Colors, MinTouch } from '@/constants/theme';
import { isAlertActive } from '@/lib/alerts';
import { prefetchTabs, useAlerts, useEnvironmentGlance } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/auth-provider';
import { useNeighborhood } from '@/lib/use-neighborhood';
import { initials } from '@/lib/format';

/** Figma 02 · Home */
export default function HomeScreen() {
  const { session, profile } = useAuth();
  const place = useNeighborhood();

  useEffect(() => {
    prefetchTabs();
  }, []);
  const alerts = useAlerts();
  const glance = useEnvironmentGlance();

  const active = (alerts.data ?? []).filter((a) => isAlertActive(a));
  const refreshing = alerts.isRefetching || glance.isRefetching;

  return (
    <Screen
      withTabBar
      refreshing={refreshing}
      onRefresh={() => {
        alerts.refetch();
        glance.refetch();
      }}>
      <View style={styles.header}>
        <Logo height={52} />
        <View style={styles.headerActions}>
          <IconButton
            icon={Bell}
            label={`Alerts${active.length ? `, ${active.length} active` : ''}`}
            badge={active.some((a) => a.category === 'emergency')}
            onPress={() => router.push('/alerts')}
          />
          {session ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              onPress={() => router.push('/profile')}
              style={styles.avatar}>
              <Text variant="bodyStrong" color="textOnBrand">
                {initials(profile?.fullName ?? session.email ?? '?')}
              </Text>
            </Pressable>
          ) : (
            <Appear>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/sign-in')}
                style={styles.signIn}>
                <Text variant="bodySmallStrong" color="textOnBrand">
                  Sign in
                </Text>
              </Pressable>
            </Appear>
          )}
        </View>
      </View>

      <NeighborhoodCard
        neighborhood={place.neighborhood}
        glance={glance.data}
        location={place.location}
        fromLocation={place.fromLocation}
        outside={place.outside}
        onUseLocation={place.requestLocation}
      />

      <SectionHeader
        title="Alerts"
        actionLabel={active.length ? `See all (${active.length})` : 'See all'}
        onAction={() => router.push('/alerts')}
      />
      {alerts.isPending ? (
        <LoadingState />
      ) : alerts.isError ? (
        <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />
      ) : active.length === 0 ? (
        <EmptyState title="No active alerts" message="We'll notify you if something comes up." />
      ) : (
        <Appear>
          <View style={styles.list}>
            {active.slice(0, 2).map((alert) => (
              <AlertRow key={alert.documentId} alert={alert} />
            ))}
          </View>
        </Appear>
      )}

      <SectionHeader title="Services" />
      <View style={styles.grid}>
        <FeatureTile icon={HouseHeart} label="Housing" onPress={() => router.push('/housing')} />
        <FeatureTile icon={Camera} label="Report" onPress={() => router.push('/report')} />
        <FeatureTile icon={Leaf} label="Local data" onPress={() => router.push('/environment')} />
        <FeatureTile icon={CalendarDays} label="Events" onPress={() => router.push('/events')} />
        <FeatureTile icon={BookOpen} label="Library" onPress={() => router.push('/library')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  avatar: {
    width: MinTouch,
    height: MinTouch,
    borderRadius: MinTouch / 2,
    backgroundColor: Colors.bgBrand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bgSurface,
  },
  signIn: {
    minHeight: MinTouch,
    paddingHorizontal: 16,
    borderRadius: MinTouch / 2,
    backgroundColor: Colors.bgBrand,
    justifyContent: 'center',
  },
  list: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
