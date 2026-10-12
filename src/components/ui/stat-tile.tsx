import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/** Environment metric tile: icon + label, big serif value, colored status line. */
export function StatTile({
  icon: Icon,
  label,
  value,
  status,
  statusColor,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  status?: string;
  statusColor?: string;
  onPress?: () => void;
}) {
  return (
    <Card
      style={styles.tile}
      onPress={onPress}
      accessibilityLabel={`${label}: ${value}${status ? `, ${status}` : ''}`}>
      <View style={styles.label}>
        <Icon size={18} color={Colors.textSecondary} strokeWidth={2} />
        <Text variant="bodySmallStrong" color="textSecondary">
          {label}
        </Text>
      </View>
      <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {status ? (
        <Text variant="bodySmallStrong" color={statusColor ?? 'textSecondary'}>
          {status}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: 6, minHeight: 116 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
