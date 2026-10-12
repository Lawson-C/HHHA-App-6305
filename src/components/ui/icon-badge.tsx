import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Radius, Tones, type Tone } from '@/constants/theme';

/** Rounded-square tinted icon used at the start of rows and tiles. */
export function IconBadge({
  icon: Icon,
  tone = 'brand',
  size = 44,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
}) {
  const t = Tones[tone];
  return (
    <View
      style={[styles.badge, { width: size, height: size, backgroundColor: t.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Icon size={Math.round(size * 0.5)} color={t.fg} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
