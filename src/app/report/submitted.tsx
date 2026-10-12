import { router } from 'expo-router';
import { Check, Info } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReportInfoSheet } from '@/components/report-info-sheet';
import { ReportProgress } from '@/components/report-progress';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { Colors, Shadow } from '@/constants/theme';
import { useMyReports } from '@/lib/api/queries';
import { blightCategory, blightStatus } from '@/lib/labels';
import { useReportDraft } from '@/lib/report-draft';

/** Figma 04 · Report — Submitted */
export default function ReportSubmittedScreen() {
  const { submitted, reset } = useReportDraft();
  const reports = useMyReports();
  const [info, setInfo] = useState(false);
  const others = (reports.data ?? [])
    .filter((r) => r.documentId !== submitted?.documentId)
    .slice(0, 2);

  return (
    <Screen
      footer={
        <>
          <Button label="Back to home" onPress={() => router.dismissTo('/')} />
          <Button
            label="Report another issue"
            variant="outline"
            onPress={() => {
              reset();
              router.dismissTo('/report');
            }}
          />
        </>
      }>
      <View style={styles.hero}>
        <View style={styles.check}>
          <Check size={36} color={Colors.textOnBrand} strokeWidth={2.5} />
        </View>
        <Text variant="display" accessibilityRole="header">
          Report sent
        </Text>
        <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
          {submitted ? `Report #${submitted.id}. ` : ''}We&apos;ll notify you at each step.
        </Text>
      </View>

      {submitted ? (
        <Card style={{ gap: 14 }}>
          <View style={styles.cardHeader}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {blightCategory[submitted.category].label}
            </Text>
            <Tag
              label={blightStatus[submitted.status].label}
              tone={blightStatus[submitted.status].tone}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How reporting works"
              onPress={() => setInfo(true)}
              hitSlop={10}>
              <Info size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <ReportProgress report={submitted} />
        </Card>
      ) : null}

      {others.length ? (
        <>
          <SectionHeader
            title="My reports"
            actionLabel="See all"
            onAction={() => router.push('/my-reports')}
          />
          <View style={{ gap: 10 }}>
            {others.map((r) => (
              <ListRow
                key={r.documentId}
                title={r.address ?? blightCategory[r.category].label}
                subtitle={blightStatus[r.status].label}
                icon={blightCategory[r.category].icon}
              />
            ))}
          </View>
        </>
      ) : null}
      <ReportInfoSheet visible={info} onClose={() => setInfo(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10, marginTop: 16 },
  check: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.bgBrand,
    borderWidth: 4,
    borderColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.raised,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
