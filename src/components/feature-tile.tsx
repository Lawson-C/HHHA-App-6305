import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { IconBadge } from '@/components/ui/icon-badge';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Shadow } from '@/constants/theme';

/** Figma "Feature Tile / Inline": icon + label in a two-column grid. */
export function FeatureTile({
  icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <IconBadge icon={icon} size={40} />
      <Text variant="bodyStrong" style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgSurface,
    ...Shadow.card,
  },
  label: { fontSize: 17 },
});
