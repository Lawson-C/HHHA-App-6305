import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors, MinTouch, PagePadding, Radius } from '@/constants/theme';

type ChipProps = { label: string; selected?: boolean; onPress?: () => void };

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed && { opacity: 0.8 },
      ]}>
      <Text variant="bodySmallStrong" color={selected ? 'textOnBrand' : 'textPrimary'}>
        {label}
      </Text>
    </Pressable>
  );
}

type Option<T extends string> = { value: T; label: string };

/** Horizontally scrolling filter chips that bleed to the screen edges, as in the prototype. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MinTouch - 8,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    justifyContent: 'center',
  },
  selected: { backgroundColor: Colors.bgBrand },
  unselected: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
  },
  row: { marginHorizontal: -PagePadding, flexGrow: 0 },
  rowContent: { paddingHorizontal: PagePadding, gap: 8 },
});
