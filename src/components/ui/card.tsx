import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors, Radius, Shadow } from '@/constants/theme';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
  accessibilityLabel?: string;
};

export function Card({ children, onPress, style, padded = true, accessibilityLabel }: CardProps) {
  const base = [styles.card, padded && styles.padded, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/** Hairline divider between rows inside a card. */
export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bgSurface, borderRadius: Radius.lg, ...Shadow.card },
  padded: { padding: 16 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.borderDefault },
});
