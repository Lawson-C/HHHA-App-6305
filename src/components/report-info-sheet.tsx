import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

const steps = [
  'The Foundation team reviews your report, usually within 2 days.',
  'If the City needs to act, we file a 311 request for you.',
  "You get a notification at each step until it's resolved.",
];

/** Figma 04 · Info sheet — How reporting works */
export function ReportInfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="How reporting works" onClose={onClose}>
      {steps.map((text, i) => (
        <View key={text} style={styles.row}>
          <View style={styles.num}>
            <Text variant="bodySmallStrong" color="textBrand">
              {i + 1}
            </Text>
          </View>
          <Text variant="bodyLarge" style={{ flex: 1 }}>
            {text}
          </Text>
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgBrandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
});
