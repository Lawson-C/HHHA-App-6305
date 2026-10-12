import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Tones, type Tone } from '@/constants/theme';

export function Tag({ label, tone = 'brand' }: { label: string; tone?: Tone }) {
  const t = Tones[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]}>
      <Text variant="bodySmall" color={t.fg} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.sm - 2,
  },
  text: { fontSize: 13, lineHeight: 18 },
});
