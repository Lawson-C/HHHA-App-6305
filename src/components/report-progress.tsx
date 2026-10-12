import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import type { BlightReport } from '@/lib/api/types';
import { formatStamp } from '@/lib/format';
import { blightSteps, blightStatus } from '@/lib/labels';

/** Vertical status timeline from Figma 04 · Report — Submitted. */
export function ReportProgress({ report }: { report: BlightReport }) {
  const currentIndex = blightSteps.indexOf(report.status);
  return (
    <View style={styles.list}>
      {blightSteps.map((step, i) => {
        const done = i < currentIndex || (i === currentIndex && step === 'resolved');
        const current = i === currentIndex && step !== 'resolved';
        const at = report.statusHistory.find((h) => h.status === step)?.at;
        return (
          <View
            key={step}
            style={styles.row}
            accessible
            accessibilityLabel={`${blightStatus[step].label}${done ? ', done' : current ? ', current step' : ''}`}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                {done ? <Check size={14} color={Colors.textOnBrand} strokeWidth={3} /> : null}
              </View>
              {i < blightSteps.length - 1 ? (
                <View style={[styles.line, done && styles.lineDone]} />
              ) : null}
            </View>
            <View style={styles.text}>
              <Text
                variant={done || current ? 'bodyStrong' : 'body'}
                color={done || current ? 'textPrimary' : 'textSecondary'}>
                {blightStatus[step].label}
              </Text>
              {at && (done || current) ? (
                <Text variant="bodySmall" color="textSecondary">
                  {formatStamp(at)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { flexDirection: 'row', gap: 12, minHeight: 44 },
  rail: { alignItems: 'center', width: 24 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: Colors.bgBrand, borderColor: Colors.bgBrand },
  dotCurrent: { borderColor: Colors.info, borderWidth: 3 },
  line: { flex: 1, width: 2, backgroundColor: Colors.borderDefault, marginVertical: 2 },
  lineDone: { backgroundColor: Colors.bgBrand },
  text: { flex: 1, paddingBottom: 10 },
});
