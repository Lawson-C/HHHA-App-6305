import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

export function StepDots({ count, index }: { count: number; index: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`Step ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.active]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.borderStrong },
  active: { width: 28, backgroundColor: Colors.bgBrand },
});
