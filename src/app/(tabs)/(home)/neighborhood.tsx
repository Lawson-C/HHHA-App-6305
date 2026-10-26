import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Bug,
  ChevronDown,
  CloudSun,
  Droplets,
  ThermometerSun,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { Colors, MinTouch, PagePadding, Radius, TabBarClearance } from '@/constants/theme';
import { useEnvironment, useEnvironmentGlance } from '@/lib/api/queries';
import type { EnvironmentCategory, EnvironmentReading } from '@/lib/api/types';
import { formatTime, formatUpdated } from '@/lib/format';
import { neighborhoods } from '@/lib/labels';
import { neighborhoodArt } from '@/lib/neighborhood-art';
import { useNeighborhood } from '@/lib/use-neighborhood';

const conditionRows: { category: EnvironmentCategory; label: string; icon: LucideIcon }[] = [
  { category: 'air_quality', label: 'Air quality', icon: Wind },
  { category: 'heat', label: 'Heat', icon: ThermometerSun },
  { category: 'water_quality', label: 'Tap water', icon: Droplets },
  { category: 'mosquito', label: 'Mosquitoes', icon: Bug },
];

function conditionColor(reading: EnvironmentReading | undefined) {
  if (!reading || reading.stale || reading.level === 'unknown')
    return Colors.textOnBrandContainerMuted;
  if (reading.level === 'good') return Colors.textOnBrand;
  return '#f2c46d'; // amber on dark, as in the prototype ("Boil advisory")
}

/** Figma 02 · Neighborhood — Expanded */
export default function NeighborhoodScreen() {
  const insets = useSafeAreaInsets();
  const glance = useEnvironmentGlance();
  const env = useEnvironment();
  const { neighborhood } = useNeighborhood();
  const info = neighborhood
    ? neighborhoods[neighborhood]
    : { label: 'Council District 3', npu: 'NPUs E, J, K, L' };
  const byCategory = new Map((env.data ?? []).map((r) => [r.category, r]));

  return (
    <View style={styles.root}>
      <Image
        source={neighborhoodArt(neighborhood)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={[StyleSheet.absoluteFill, styles.fade]} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: TabBarClearance + insets.bottom },
        ]}>
        <View style={styles.header}>
          <Text variant="bodySmallStrong" color="textOnBrandContainerMuted">
            Your neighborhood
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Collapse"
            onPress={() => router.back()}
            style={styles.collapse}>
            <ChevronDown size={22} color={Colors.textOnBrand} />
          </Pressable>
        </View>
        <View style={{ gap: 4 }}>
          <Text variant="display" color="textOnBrand" accessibilityRole="header">
            {info.label}
          </Text>
          <Text variant="body" color="textOnBrandContainerMuted">
            {neighborhood ? `Council District 3 · ${info.npu}` : info.npu}
          </Text>
        </View>

        {glance.isPending ? (
          <LoadingState />
        ) : glance.data ? (
          <>
            <View style={styles.weatherRow}>
              <CloudSun size={36} color={Colors.accentSky} />
              <Text variant="titleLarge" color="textOnBrand">
                {glance.data.temperatureF != null
                  ? `${Math.round(glance.data.temperatureF)}°`
                  : '—'}
              </Text>
              <View>
                <Text variant="bodyStrong" color="textOnBrand">
                  {glance.data.conditions ?? 'Weather not available'}
                </Text>
                {glance.data.highF != null && glance.data.lowF != null ? (
                  <Text variant="bodySmall" color="textOnBrandContainerMuted">
                    High {Math.round(glance.data.highF)}° · Low {Math.round(glance.data.lowF)}°
                  </Text>
                ) : null}
              </View>
            </View>
            {glance.data.hourly.length ? (
              <View style={[styles.panel, styles.hourlyPanel]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hourly}
                  accessibilityLabel="Hourly forecast">
                  {glance.data.hourly.map((h, i) => (
                    <View
                      key={h.time}
                      style={styles.hour}
                      accessible
                      accessibilityLabel={`${i === 0 ? 'Now' : formatTime(h.time)}, ${Math.round(h.temperatureF)} degrees`}>
                      <Text variant="bodySmall" color="textOnBrandContainerMuted">
                        {i === 0 ? 'Now' : formatTime(h.time).replace(':00', '')}
                      </Text>
                      <CloudSun size={20} color={Colors.textOnBrandContainer} />
                      <Text variant="bodySmallStrong" color="textOnBrand">
                        {Math.round(h.temperatureF)}°
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : null}

        <Text variant="bodySmallStrong" color="textOnBrandContainerMuted">
          Conditions
        </Text>
        <View style={styles.panel}>
          {conditionRows.map((row, i) => {
            const reading = byCategory.get(row.category);
            return (
              <View key={row.category} style={[styles.condition, i > 0 && styles.conditionBorder]}>
                <row.icon size={20} color={Colors.textOnBrandContainer} />
                <Text variant="body" color="textOnBrand" style={{ flex: 1 }}>
                  {row.label}
                </Text>
                <Text variant="bodyStrong" style={{ color: conditionColor(reading) }}>
                  {reading ? (reading.stale ? 'Not current' : reading.summary) : 'Not available'}
                </Text>
              </View>
            );
          })}
        </View>
        <Text variant="bodySmall" color="textOnBrandContainerMuted">
          {formatUpdated(glance.data?.updatedAt ?? null)}
        </Text>
        <Button
          label="See all neighborhood data"
          variant="inverse"
          onPress={() => router.push('/environment')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgBrandContainer },
  fade: { backgroundColor: 'rgba(31,59,44,0.35)' },
  content: { paddingHorizontal: PagePadding, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collapse: {
    width: MinTouch,
    height: MinTouch,
    borderRadius: MinTouch / 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
  },
  // Panel padding moves inside the scroll view so hours scroll edge to edge.
  hourlyPanel: { paddingHorizontal: 0 },
  hourly: { paddingVertical: 14, paddingHorizontal: 8 },
  hour: { alignItems: 'center', gap: 6, width: 58 },
  condition: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  conditionBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
});
