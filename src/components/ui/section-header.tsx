import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text variant="titleMedium" accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12}>
          <Text variant="bodySmallStrong" color="textBrand" style={styles.action}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: -6,
  },
  action: { fontSize: 15 },
});
