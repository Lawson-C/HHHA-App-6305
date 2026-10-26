import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronRight, CloudSun, LocateFixed, MapPin } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors, Radius, Shadow } from '@/constants/theme';
import type { EnvironmentGlance, Neighborhood } from '@/lib/api/types';
import { neighborhoods } from '@/lib/labels';
import type { LocationState } from '@/lib/location';
import { neighborhoodArt } from '@/lib/neighborhood-art';

/** Home "Your neighborhood" card (Figma 02 · Home). Opens the expanded neighborhood view. */
export function NeighborhoodCard({
  neighborhood,
  glance,
  location,
  fromLocation,
  outside,
  onUseLocation,
}: {
  neighborhood: Neighborhood | null;
  glance: EnvironmentGlance | undefined;
  location: LocationState;
  /** True when `neighborhood` came from the phone's location (not the saved profile value). */
  fromLocation: boolean;
  /** Location is on but the phone is outside District 3. */
  outside: boolean;
  onUseLocation: () => void;
}) {
  const name = neighborhood ? neighborhoods[neighborhood].label : 'Council District 3';
  const weather =
    glance?.temperatureF != null
      ? `${Math.round(glance.temperatureF)}°  ${glance.conditions ?? ''}`
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your neighborhood, ${name}. ${weather ?? ''}. Open neighborhood details`}
      onPress={() => router.push('/neighborhood')}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.95 }]}>
      <Image
        source={neighborhoodArt(neighborhood)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.header}>
        <Text variant="bodySmallStrong" color="textOnBrandContainerMuted">
          Your neighborhood
        </Text>
        <View style={styles.chevron}>
          <ChevronRight size={18} color={Colors.textOnBrand} />
        </View>
      </View>
      <Text variant="titleLarge" color="textOnBrand" numberOfLines={1} adjustsFontSizeToFit>
        {name}
      </Text>
      {weather ? (
        <View style={styles.weather}>
          <CloudSun size={20} color={Colors.textOnBrandContainer} />
          <Text variant="body" color="textOnBrandContainer">
            {weather}
          </Text>
        </View>
      ) : null}
      <LocationLine
        location={location}
        fromLocation={fromLocation}
        outside={outside}
        onUseLocation={onUseLocation}
      />
    </Pressable>
  );
}

/** Where the card's neighborhood came from, or a way to turn location on. */
function LocationLine({
  location,
  fromLocation,
  outside,
  onUseLocation,
}: {
  location: LocationState;
  fromLocation: boolean;
  outside: boolean;
  onUseLocation: () => void;
}) {
  if (fromLocation) {
    return (
      <View style={styles.locationRow}>
        <MapPin size={16} color={Colors.textOnBrandContainerMuted} />
        <Text variant="bodySmall" color="textOnBrandContainerMuted">
          Based on your location
        </Text>
      </View>
    );
  }
  if (outside) {
    return (
      <View style={styles.locationRow}>
        <MapPin size={16} color={Colors.textOnBrandContainerMuted} />
        <Text variant="bodySmall" color="textOnBrandContainerMuted">
          You&apos;re outside District 3 right now
        </Text>
      </View>
    );
  }
  if (location.status === 'locating') {
    return (
      <View style={styles.locationRow}>
        <LocateFixed size={16} color={Colors.textOnBrandContainerMuted} />
        <Text variant="bodySmall" color="textOnBrandContainerMuted">
          Finding your neighborhood…
        </Text>
      </View>
    );
  }
  const denied = location.status === 'denied';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={denied ? 'Opens Settings to allow location' : 'Asks to use your location'}
      onPress={denied ? () => Linking.openSettings() : onUseLocation}
      hitSlop={8}
      style={({ pressed }) => [styles.locationButton, pressed && { opacity: 0.8 }]}>
      <LocateFixed size={16} color={Colors.textOnBrand} />
      <Text variant="bodySmallStrong" color="textOnBrand">
        {denied ? 'Location is off · Open Settings' : 'Use my location'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.bgBrandContainer,
    padding: 18,
    gap: 6,
    minHeight: 150,
    ...Shadow.raised,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weather: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
});
