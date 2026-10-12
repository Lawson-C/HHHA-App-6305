import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Check, Share2, TriangleAlert } from 'lucide-react-native';
import { Share, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Colors, Radius, Tones } from '@/constants/theme';
import { useAlert } from '@/lib/api/queries';
import { formatStamp } from '@/lib/format';
import { alertCategory } from '@/lib/labels';

/** Figma 02 · Alert Detail */
export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: alert, isPending, isError, error, refetch } = useAlert(id);

  const share = () =>
    alert &&
    Share.share({ message: `${alert.title}: ${alert.message} (via the Hunter Hills app)` });

  return (
    <Screen withTabBar>
      <TopBar
        title="Alert"
        trailing={alert ? <IconButton icon={Share2} label="Share alert" onPress={share} /> : null}
      />
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <View style={styles.titleBlock}>
            <Tag
              label={alertCategory[alert.category].label}
              tone={alertCategory[alert.category].tone}
            />
            <Text variant="display" accessibilityRole="header">
              {alert.title}
            </Text>
            <Text variant="body" color="textSecondary">
              {alert.issuer ? `Issued by ${alert.issuer} · ` : ''}
              {formatStamp(alert.sentAt)}
            </Text>
          </View>

          {alert.actionSteps.length ? (
            <View
              style={[
                styles.callout,
                { backgroundColor: Tones[alertCategory[alert.category].tone].bg },
              ]}>
              <View style={styles.calloutTitle}>
                <TriangleAlert size={20} color={Colors.danger} />
                <Text variant="bodyStrong" color="danger">
                  What to do now
                </Text>
              </View>
              {alert.actionSteps.map((step) => (
                <View key={step} style={styles.step}>
                  <Check size={18} color={Colors.textPrimary} style={styles.stepIcon} />
                  <Text variant="body" style={styles.stepText}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {alert.body ? <Text variant="bodyLarge">{alert.body}</Text> : null}

          {alert.affectedArea ? (
            <View style={styles.section}>
              <Text variant="titleMedium" accessibilityRole="header">
                Affected area
              </Text>
              <Image
                source={require('@/assets/maps/alert-area.jpg')}
                style={styles.map}
                contentFit="cover"
                accessibilityLabel={`Map of the affected area: ${alert.affectedArea}`}
              />
              <Text variant="body" color="textSecondary">
                {alert.affectedArea}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 8 },
  callout: { borderRadius: Radius.lg, padding: 16, gap: 10 },
  calloutTitle: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  step: { flexDirection: 'row', gap: 10 },
  stepIcon: { marginTop: 3 },
  stepText: { flex: 1 },
  section: { gap: 10 },
  map: { width: '100%', aspectRatio: 362 / 170, borderRadius: Radius.lg },
});
