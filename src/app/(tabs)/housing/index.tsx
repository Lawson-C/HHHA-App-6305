import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BedDouble, HandHeart, Phone } from 'lucide-react-native';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { PageTitle } from '@/components/ui/page-title';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { Colors, PagePadding, Radius, Tones } from '@/constants/theme';
import { useHousingListings, useHousingResources } from '@/lib/api/queries';
import type { HousingCategory } from '@/lib/api/types';
import { housingCategory, neighborhoods } from '@/lib/labels';

const order: HousingCategory[] = [
  'rental_assistance',
  'eviction_prevention',
  'affordable_housing',
  'homeownership',
  'home_repair',
];

/** Figma 05 · Housing */
export default function HousingScreen() {
  const eviction = useHousingResources('eviction_prevention');
  const listings = useHousingListings();
  const evictionProgram = eviction.data?.[0];

  const getHelp = () => {
    if (evictionProgram?.contactPhone) Linking.openURL(`tel:${evictionProgram.contactPhone}`);
    else if (evictionProgram)
      router.push({ pathname: '/program/[id]', params: { id: evictionProgram.documentId } });
    else
      router.push({
        pathname: '/housing/category/[category]',
        params: { category: 'eviction_prevention' },
      });
  };

  return (
    <Screen withTabBar>
      <PageTitle title="Housing" />

      <View style={[styles.banner, { backgroundColor: Tones.warning.bg }]}>
        <View style={styles.bannerRow}>
          <View style={styles.bannerIcon}>
            <HandHeart size={22} color={Colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Facing eviction?</Text>
            <Text variant="body" color="textSecondary">
              Free legal help is available today.
            </Text>
          </View>
        </View>
        <Button
          label="Get help today"
          icon={Phone}
          size="small"
          onPress={getHelp}
          style={styles.bannerButton}
        />
      </View>

      <SectionHeader title="Find help by need" />
      <View style={styles.list}>
        {order.map((category) => (
          <ListRow
            key={category}
            title={housingCategory[category].label}
            icon={housingCategory[category].icon}
            onPress={() =>
              router.push({ pathname: '/housing/category/[category]', params: { category } })
            }
          />
        ))}
      </View>

      {listings.data?.length ? (
        <>
          <SectionHeader title="Open listings" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.listingsScroll}
            contentContainerStyle={styles.listings}>
            {listings.data.map((l) => (
              <Card
                key={l.documentId}
                padded={false}
                style={styles.listing}
                onPress={l.url ? () => Linking.openURL(l.url!) : undefined}
                accessibilityLabel={`${l.title}, ${l.address}, ${l.rentLabel ?? ''}`}>
                {l.imageUrl ? (
                  <Image
                    source={{ uri: l.imageUrl }}
                    style={styles.listingImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.listingImage, styles.listingPlaceholder]}>
                    <BedDouble size={28} color={Colors.textBrand} />
                  </View>
                )}
                <View style={styles.listingBody}>
                  <Text variant="bodyStrong">{l.rentLabel ?? l.title}</Text>
                  <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                    {l.title} · {l.address}
                  </Text>
                  {l.neighborhood ? (
                    <Text variant="bodySmall" color="textBrand">
                      {neighborhoods[l.neighborhood].label}
                    </Text>
                  ) : null}
                </View>
              </Card>
            ))}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Radius.lg, padding: 16, gap: 14 },
  bannerRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerButton: { alignSelf: 'flex-start' },
  list: { gap: 10 },
  listingsScroll: { marginHorizontal: -PagePadding },
  listings: { paddingHorizontal: PagePadding, gap: 12, paddingBottom: 8 },
  listing: { width: 240, overflow: 'hidden' },
  listingImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  listingPlaceholder: {
    backgroundColor: Colors.bgBrandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingBody: { padding: 14, gap: 2 },
});
