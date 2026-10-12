import { router } from 'expo-router';
import { Info, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ReportInfoSheet } from '@/components/report-info-sheet';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Colors, Radius, Shadow, Tones } from '@/constants/theme';
import type { BlightCategory } from '@/lib/api/types';
import { blightCategory } from '@/lib/labels';
import { useReportDraft } from '@/lib/report-draft';

const order: BlightCategory[] = [
  'illegal_dumping',
  'vacant_lot',
  'abandoned_building',
  'standing_water',
  'air_odor',
  'other',
];

/** Figma 04 · Report — Choose Type */
export default function ChooseTypeScreen() {
  const { draft, update, locate } = useReportDraft();
  const [info, setInfo] = useState(false);

  return (
    <Screen
      footer={
        <Button
          label="Continue"
          disabled={!draft.category}
          onPress={() => {
            // Start finding the location now so it's ready on the next screen.
            if (!draft.location) locate();
            router.push('/report/details');
          }}
          accessibilityHint={draft.category ? undefined : 'Choose what you want to report first'}
        />
      }>
      <TopBar leading="close" trailingText="Step 1 of 2" />
      <View style={styles.titleRow}>
        <Text variant="titleLarge" accessibilityRole="header" style={{ flex: 1 }}>
          What would you like to report?
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How reporting works"
          onPress={() => setInfo(true)}
          hitSlop={12}>
          <Info size={24} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.grid} accessibilityRole="radiogroup">
        {order.map((category) => {
          const c = blightCategory[category];
          const selected = draft.category === category;
          return (
            <Pressable
              key={category}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${c.label}. ${c.hint}`}
              onPress={() => update({ category })}
              style={[styles.tile, selected && styles.tileSelected]}>
              <IconBadge icon={c.icon} size={40} />
              <Text variant="bodyStrong" style={styles.tileTitle}>
                {c.label}
              </Text>
              <Text variant="bodySmall" color="textSecondary">
                {c.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="If someone is in danger or there's a fire, call 911 first"
        onPress={() => Linking.openURL('tel:911')}
        style={[styles.emergency, { backgroundColor: Tones.info.bg }]}>
        <Phone size={20} color={Colors.info} />
        <Text variant="bodyStrong" color="info" style={{ flex: 1 }}>
          If someone is in danger or there&apos;s a fire, call 911 first.
        </Text>
      </Pressable>

      <ReportInfoSheet visible={info} onClose={() => setInfo(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 14,
    gap: 6,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgSurface,
    borderWidth: 2,
    borderColor: 'transparent',
    ...Shadow.card,
  },
  tileSelected: { borderColor: Colors.borderBrand, backgroundColor: Colors.bgBrandFaint },
  tileTitle: { fontSize: 17, marginTop: 4 },
  emergency: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
});
