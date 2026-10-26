import { CloudOff, Inbox } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';

/**
 * Spinner for slow loads only: it appears after a short delay, so fast responses (most of
 * them, from the CDN or cache) go straight to content without a flash.
 */
export function LoadingState({
  label = 'Loading…',
  delayMs = 250,
}: {
  label?: string;
  delayMs?: number;
}) {
  const [visible, setVisible] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return (
    <View style={styles.box} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      {visible ? <ActivityIndicator color={Colors.bgBrand} /> : null}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.box}>
      <Inbox size={28} color={Colors.textSecondary} />
      <Text variant="bodyStrong" style={styles.center}>
        {title}
      </Text>
      {message ? (
        <Text variant="bodySmall" color="textSecondary" style={styles.center}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <CloudOff size={28} color={Colors.danger} />
      <Text variant="bodyStrong" style={styles.center}>
        We couldn&apos;t load this
      </Text>
      <Text variant="bodySmall" color="textSecondary" style={styles.center}>
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" variant="outline" size="small" onPress={onRetry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 32 },
  center: { textAlign: 'center' },
});
