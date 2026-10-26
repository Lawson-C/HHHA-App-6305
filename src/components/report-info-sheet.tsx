import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { useAppCopy } from '@/lib/app-copy';

/** Figma 04 · Info sheet — How reporting works */
export function ReportInfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const steps = useAppCopy().reportingSteps;
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
