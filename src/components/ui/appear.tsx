import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

/**
 * Fades its children in when they first mount: wrap content that replaces a loading state,
 * so data arriving doesn't pop in with a hard cut.
 */
export function Appear({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  // Same vertical rhythm as <Screen> content, so wrapping a fragment doesn't change spacing.
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[{ gap: 20 }, style]}>
      {children}
    </Animated.View>
  );
}
