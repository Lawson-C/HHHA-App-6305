import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';

/** Big serif tab title ("Events", "Housing", "Library") with an optional action on the right. */
export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="titleLarge" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  title: { flexShrink: 1 },
});
