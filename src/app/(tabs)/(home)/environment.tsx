import { Image } from 'expo-image';
import { Bug, Droplets, Info, ThermometerSun, Wind, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ChipRow } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { StatTile } from '@/components/ui/stat-tile';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Colors, Radius } from '@/constants/theme';
import { useEnvironment } from '@/lib/api/queries';
import type { EnvironmentCategory, EnvironmentReading } from '@/lib/api/types';
import { formatRelative, formatUpdated } from '@/lib/format';
import { environmentLevel } from '@/lib/labels';

type Tab = 'overview' | 'air_quality' | 'water_quality' | 'heat' | 'mosquito';

const tabs: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'air_quality', label: 'Air' },
  { value: 'water_quality', label: 'Water' },
  { value: 'heat', label: 'Heat' },
  { value: 'mosquito', label: 'Mosquitoes' },
];

const tiles: { category: EnvironmentCategory; label: string; icon: LucideIcon }[] = [
  { category: 'air_quality', label: 'Air quality', icon: Wind },
  { category: 'water_quality', label: 'Tap water', icon: Droplets },
  { category: 'heat', label: 'Heat index', icon: ThermometerSun },
  { category: 'mosquito', label: 'Mosquito risk', icon: Bug },
];

const explainers: Partial<Record<EnvironmentCategory, string>> = {
  air_quality:
    'The Air Quality Index (AQI) runs from 0 to 500. Under 50 is good. Over 100, people with asthma, heart disease, older adults and children should limit time outside.',
  water_quality:
    'Tap water status comes from the City of Atlanta. During a boil water advisory, boil water for at least one minute before drinking or cooking with it.',
  heat: 'The heat index is how hot it feels when humidity is added to the temperature. Over 90°F, take breaks in the shade and drink water often.',
  mosquito:
    'Mosquito risk is based on Fulton County Health spraying and trap reports. Empty standing water around your home to lower the risk.',
};

const aqiBands = [
  { label: 'Good', range: '0–50', color: Colors.accentLeaf },
  { label: 'Moderate', range: '51–100', color: Colors.warning },
  { label: 'Unhealthy for sensitive groups', range: '101–150', color: Colors.danger },
  { label: 'Unhealthy', range: '151+', color: '#44507a' },
];

const sources = [
  ['Air quality', 'AirNow (EPA)'],
  ['Tap water', 'Atlanta Watershed Mgmt.'],
  ['Heat', 'National Weather Service'],
  ['Mosquitoes', 'Fulton County Health'],
  ['Neighbor reports', 'Residents, via this app'],
];

function valueFor(reading: EnvironmentReading | undefined) {
  if (!reading) return '—';
  if (reading.value == null) return reading.summary;
  return reading.unit === '°F'
    ? `${Math.round(reading.value)}°`
    : String(Math.round(reading.value));
}

function statusFor(reading: EnvironmentReading | undefined) {
  if (!reading) return { text: 'Not available', color: Colors.textSecondary };
  if (reading.stale)
    return {
      text: `Last updated ${formatRelative(reading.observedAt ?? '')}`,
      color: Colors.textSecondary,
    };
  // When the value itself is a word (e.g. "Low"), the status line repeats nothing.
  const text = reading.value == null && reading.category !== 'water_quality' ? '' : reading.summary;
  return { text, color: environmentLevel[reading.level].color };
}

/** Figma 06 · Environment */
export default function EnvironmentScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [sheet, setSheet] = useState<'aqi' | 'sources' | null>(null);
  const env = useEnvironment();
  const byCategory = new Map((env.data ?? []).map((r) => [r.category, r]));
  const updatedAt =
    env.data
      ?.map((r) => r.observedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const visibleTiles = tab === 'overview' ? tiles : tiles.filter((t) => t.category === tab);

  return (
    <Screen withTabBar refreshing={env.isRefetching} onRefresh={() => env.refetch()}>
      <TopBar
        title="Neighborhood data"
        trailing={
          <IconButton
            icon={Info}
            label="Where this data comes from"
            onPress={() => setSheet('sources')}
          />
        }
      />
      <View style={{ gap: 4 }}>
        <Text variant="titleLarge" accessibilityRole="header">
          Your neighborhood
        </Text>
        <Text variant="bodySmallStrong" color="textSecondary">
          {formatUpdated(updatedAt)}
        </Text>
      </View>
      <ChipRow options={tabs} value={tab} onChange={setTab} />

      {env.isPending ? (
        <LoadingState />
      ) : env.isError ? (
        <ErrorState error={env.error} onRetry={() => env.refetch()} />
      ) : (
        <>
          <View style={styles.grid}>
            {visibleTiles.map((t) => {
              const reading = byCategory.get(t.category);
              const status = statusFor(reading);
              return (
                <View key={t.category} style={styles.tileWrap}>
                  <StatTile
                    icon={t.icon}
                    label={t.label}
                    value={valueFor(reading)}
                    status={status.text}
                    statusColor={status.color}
                    onPress={
                      t.category === 'air_quality'
                        ? () => setSheet('aqi')
                        : () => setTab(t.category as Tab)
                    }
                  />
                </View>
              );
            })}
          </View>

          {tab !== 'overview' ? (
            <Card style={{ gap: 8 }}>
              <Text variant="bodyStrong">About this measure</Text>
              <Text variant="body" color="textSecondary">
                {explainers[tab]}
              </Text>
              {byCategory.get(tab)?.source ? (
                <Text variant="bodySmall" color="textSecondary">
                  Source: {byCategory.get(tab)!.source}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {tab === 'overview' || tab === 'heat' ? (
            <Card style={{ gap: 12 }}>
              <Text variant="titleSmall">Heat zones today</Text>
              <Image
                source={require('@/assets/maps/district-heat.jpg')}
                style={styles.map}
                contentFit="cover"
                accessibilityLabel="Map of District 3 showing the hottest areas in orange and red"
              />
              <Text variant="bodySmall" color="textSecondary">
                Darker orange areas get hotter in the afternoon. Cooling centers open when the heat
                index passes 100°F.
              </Text>
            </Card>
          ) : null}
        </>
      )}

      <Sheet visible={sheet === 'aqi'} title="Air quality index" onClose={() => setSheet(null)}>
        {aqiBands.map((band) => (
          <View key={band.label} style={styles.band}>
            <View style={[styles.swatch, { backgroundColor: band.color }]} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {band.label}
            </Text>
            <Text variant="body" color="textSecondary">
              {band.range}
            </Text>
          </View>
        ))}
        <Text variant="bodySmall" color="textSecondary">
          From AirNow (EPA), updated hourly.
        </Text>
      </Sheet>

      <Sheet
        visible={sheet === 'sources'}
        title="Where this data comes from"
        onClose={() => setSheet(null)}>
        {sources.map(([label, source]) => (
          <View key={label} style={styles.band}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {label}
            </Text>
            <Text variant="body" color="textSecondary">
              {source}
            </Text>
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tileWrap: { flexBasis: '47%', flexGrow: 1 },
  map: { width: '100%', aspectRatio: 330 / 170, borderRadius: Radius.md },
  band: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  swatch: { width: 16, height: 4, borderRadius: 2 },
});
