import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors, MinTouch, Radius } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'inverse' | 'ghost';

const variants: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: Colors.bgBrand, fg: Colors.textOnBrand },
  secondary: { bg: Colors.bgBrandSubtle, fg: Colors.textBrand },
  outline: { bg: Colors.bgSurface, fg: Colors.textPrimary, border: Colors.borderDefault },
  danger: { bg: Colors.danger, fg: Colors.textOnBrand },
  /** White button on dark (brand) backgrounds. */
  inverse: { bg: Colors.bgSurface, fg: Colors.textPrimary },
  ghost: { bg: 'transparent', fg: Colors.textBrand },
};

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'large' | 'small';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  icon: Icon,
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const v = variants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'large' ? styles.large : styles.small,
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg },
        v.border ? styles.bordered : null,
        inactive && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={size === 'large' ? 20 : 16} color={v.fg} strokeWidth={2} /> : null}
          <Text variant={size === 'large' ? 'button' : 'bodySmallStrong'} color={v.fg}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  large: { minHeight: 52 },
  small: { minHeight: MinTouch - 4, paddingHorizontal: 16 },
  bordered: { borderWidth: 1.5 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
