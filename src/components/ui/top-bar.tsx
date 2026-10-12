import { router } from 'expo-router';
import { ArrowLeft, X, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { MinTouch } from '@/constants/theme';

type TopBarProps = {
  title?: string;
  /** `back` (arrow) or `close` (X). Defaults to back. */
  leading?: 'back' | 'close' | 'none';
  onLeadingPress?: () => void;
  trailing?: ReactNode;
  /** Small text on the right instead of a button (e.g. "Step 1 of 2"). */
  trailingText?: string;
};

/** Screen header from the prototype: round back button, centered title, optional action. */
export function TopBar({
  title,
  leading = 'back',
  onLeadingPress,
  trailing,
  trailingText,
}: TopBarProps) {
  const icon: LucideIcon = leading === 'close' ? X : ArrowLeft;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {leading !== 'none' ? (
          <IconButton
            icon={icon}
            label={leading === 'close' ? 'Close' : 'Back'}
            onPress={onLeadingPress ?? goBack}
          />
        ) : null}
      </View>
      {title ? (
        <Text
          variant="titleSmall"
          style={styles.title}
          numberOfLines={1}
          accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}
      <View style={[styles.side, styles.right]}>
        {trailing}
        {trailingText ? (
          <Text variant="bodySmallStrong" color="textSecondary">
            {trailingText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: MinTouch },
  side: { minWidth: MinTouch, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17 },
});
