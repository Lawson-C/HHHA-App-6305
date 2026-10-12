import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronRight, CloudSun } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors, Radius, Shadow } from '@/constants/theme';
import type { EnvironmentGlance, Neighborhood } from '@/lib/api/types';
import { neighborhoods } from '@/lib/labels';
import { neighborhoodArt } from '@/lib/neighborhood-art';

/** Home "Your neighborhood" card (Figma 02 · Home). Opens the expanded neighborhood view. */
export function NeighborhoodCard({
  neighborhood,
  glance,
}: {
  neighborhood: Neighborhood | null;
  glance: EnvironmentGlance | undefined;
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
});
