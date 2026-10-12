import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/** Settings row with an icon, title, description and a switch (Figma "Settings Row"). */
export function ToggleRow({
  icon: Icon,
  title,
  description,
  value,
  onValueChange,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Icon size={22} color={Colors.textBrand} strokeWidth={2} />
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        {description ? (
          <Text variant="bodySmall" color="textSecondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={description}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: Colors.bgBrand, false: Colors.borderStrong }}
        thumbColor={Colors.bgSurface}
        ios_backgroundColor={Colors.borderStrong}
        style={disabled ? styles.disabled : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  text: { flex: 1, gap: 1 },
  disabled: { opacity: 0.55 },
});
