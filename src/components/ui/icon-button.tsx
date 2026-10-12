import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, MinTouch, Shadow } from '@/constants/theme';

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  /** Small dot (e.g. unread alerts). */
  badge?: boolean;
  tone?: 'surface' | 'onDark';
};

/** 44pt round white button (back, share, search, bell...). */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  badge,
  tone = 'surface',
}: IconButtonProps) {
  const onDark = tone === 'onDark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        onDark ? styles.onDark : styles.surface,
        pressed && { opacity: 0.75 },
      ]}>
      <Icon size={22} color={onDark ? Colors.textOnBrand : Colors.textPrimary} strokeWidth={2} />
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MinTouch,
    height: MinTouch,
    borderRadius: MinTouch / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: { backgroundColor: Colors.bgSurface, ...Shadow.card },
  onDark: { backgroundColor: 'rgba(255,255,255,0.14)' },
  badge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: Colors.bgSurface,
  },
});
