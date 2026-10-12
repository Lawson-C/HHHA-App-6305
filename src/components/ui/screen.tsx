import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, PagePadding, TabBarClearance } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  /** Pinned under the scroll area (e.g. "Continue", "Submit report"). */
  footer?: ReactNode;
  /** Leave room for the floating tab bar. */
  withTabBar?: boolean;
  /** `aurora` = soft green/blue wash from the prototype; `plain` = canvas color. */
  background?: 'aurora' | 'plain' | 'none';
  scroll?: boolean;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Standard screen scaffold: background, safe areas, page padding, optional footer. */
export function Screen({
  children,
  footer,
  withTabBar = false,
  background = 'aurora',
  scroll = true,
  contentStyle,
  refreshing,
  onRefresh,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = withTabBar ? TabBarClearance + insets.bottom : footer ? 24 : insets.bottom + 24;

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: bottomPad },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, { paddingTop: insets.top + 8 }, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.root, background !== 'none' && { backgroundColor: Colors.bgCanvas }]}>
      {background === 'aurora' ? (
        <Image
          source={require('@/assets/art/aurora.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
        />
      ) : null}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  content: { paddingHorizontal: PagePadding, gap: 20 },
  footer: {
    paddingHorizontal: PagePadding,
    paddingTop: 12,
    gap: 10,
    backgroundColor: 'rgba(245,247,245,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderDefault,
  },
});
