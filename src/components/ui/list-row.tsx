import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconBadge } from '@/components/ui/icon-badge';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Shadow, type Tone } from '@/constants/theme';

type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: Tone;
  onPress?: () => void;
  trailing?: ReactNode;
  /** Render as a standalone card (default) or flat inside a grouped card. */
  standalone?: boolean;
};

/** Icon + title + supporting text + chevron. Used for alerts, programs, articles, reports. */
export function ListRow({
  title,
  subtitle,
  icon,
  tone = 'brand',
  onPress,
  trailing,
  standalone = true,
}: ListRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        standalone && styles.standalone,
        pressed && onPress ? { opacity: 0.85 } : null,
      ]}>
      {icon ? <IconBadge icon={icon} tone={tone} /> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <ChevronRight size={20} color={Colors.textSecondary} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  standalone: { backgroundColor: Colors.bgSurface, borderRadius: Radius.lg, ...Shadow.card },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17 },
});
