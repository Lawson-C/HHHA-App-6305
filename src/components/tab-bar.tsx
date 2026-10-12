import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router, type Tabs } from 'expo-router';
import {
  BookOpen,
  CalendarDays,
  Camera,
  House,
  HouseHeart,
  type LucideIcon,
} from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { Colors, PagePadding, Radius, Shadow } from '@/constants/theme';

/** iOS 26+ renders the system's real Liquid Glass; older iOS gets a blur, Android a frosted fill. */
const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs: Record<string, { label: string; icon: LucideIcon }> = {
  '(home)': { label: 'Home', icon: House },
  events: { label: 'Events', icon: CalendarDays },
  housing: { label: 'Housing', icon: HouseHeart },
  library: { label: 'Library', icon: BookOpen },
};

/**
 * Floating glass tab bar with a separate round "Report" button, from the Figma
 * "Navigation / Tab Bar" component. Report opens the blight-report flow as a modal.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none">
      <View style={[styles.pill, !liquidGlass && styles.pillFallback]}>
        {liquidGlass ? (
          <GlassView glassEffectStyle="regular" isInteractive style={StyleSheet.absoluteFill} />
        ) : Platform.OS === 'ios' ? (
          <BlurView intensity={60} tint="systemThinMaterialLight" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.pillTint} />
        )}
        {state.routes.map((route, index) => {
          const tab = tabs[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const Icon = tab.icon;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={[styles.tab, focused && styles.tabActive]}>
              <Icon
                size={24}
                color={focused ? Colors.textBrand : Colors.textPrimary}
                strokeWidth={2}
              />
              <Text variant="tab" color={focused ? 'textBrand' : 'textPrimary'}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report an issue"
        onPress={() => router.push('/report')}
        style={({ pressed }) => [
          styles.report,
          !liquidGlass && styles.reportFallback,
          pressed && { opacity: 0.9 },
        ]}>
        {liquidGlass ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor={Colors.bgBrand}
            isInteractive
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Camera size={24} color={Colors.textOnBrand} strokeWidth={2} />
        <Text variant="tab" color="textOnBrand">
          Report
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: PagePadding - 4,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    padding: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  pillFallback: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(245,247,245,0.35)' : undefined,
    ...Shadow.raised,
  },
  pillTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(245,247,245,0.96)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  tabActive: { backgroundColor: 'rgba(26,98,50,0.13)' },
  report: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  reportFallback: { backgroundColor: Colors.bgBrand, overflow: 'visible', ...Shadow.raised },
});
