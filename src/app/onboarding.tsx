import { router } from 'expo-router';
import {
  Bell,
  Bug,
  CalendarDays,
  Camera,
  ChevronRight,
  HouseHeart,
  MapPin,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Screen } from '@/components/ui/screen';
import { StepDots } from '@/components/ui/step-dots';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Shadow, type Tone } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { askForNotifications } from '@/lib/push';

type PreviewRow = { icon: LucideIcon; tone: Tone; title: string; meta: string };

type Step = {
  icon: LucideIcon;
  title: string;
  body: string;
  rows: PreviewRow[];
  primary: { label: string; icon?: LucideIcon };
};

const steps: Step[] = [
  {
    icon: Bell,
    title: 'Stay safe with alerts',
    body: "Get emergency and health alerts the moment they're issued. You choose what else you hear about, like meetings and community news.",
    rows: [
      {
        icon: TriangleAlert,
        tone: 'danger',
        title: 'Boil water advisory',
        meta: 'City of Atlanta · now',
      },
      {
        icon: Bug,
        tone: 'warning',
        title: 'Mosquito spraying tonight',
        meta: '9 PM · Fulton County Health',
      },
    ],
    primary: { label: 'Turn on notifications', icon: Bell },
  },
  {
    icon: Camera,
    title: 'Report problems in a few taps',
    body: 'Snap a photo of illegal dumping, a vacant lot or standing water. The Foundation team follows up with the City for you.',
    rows: [
      {
        icon: Camera,
        tone: 'brand',
        title: 'Illegal dumping',
        meta: 'Report #1042 · Under review',
      },
      { icon: MapPin, tone: 'info', title: 'Near 600 Lindsay St NW', meta: 'From photo location' },
    ],
    primary: { label: 'Next' },
  },
  {
    icon: HouseHeart,
    title: 'Find help and events',
    body: 'Rental help, free workshops and neighborhood meetings, all checked by your neighborhood association.',
    rows: [
      {
        icon: HouseHeart,
        tone: 'brand',
        title: 'Emergency rental assistance',
        meta: 'Up to 3 months of rent',
      },
      {
        icon: CalendarDays,
        tone: 'warning',
        title: 'Budgeting basics workshop',
        meta: 'Thu · Community Center',
      },
    ],
    primary: { label: 'Create an account' },
  },
];

/** Figma 01 · Quick Start (3 steps). */
export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const { markWelcomeSeen } = useAuth();
  const step = steps[index]!;
  const last = index === steps.length - 1;

  const finish = (to: '/sign-up' | '/') => {
    markWelcomeSeen();
    if (to === '/') router.dismissTo('/');
    else router.replace(to);
  };

  const next = async () => {
    if (index === 0) {
      // Ask now, while the benefit is on screen. Declining is fine; emergency alerts are
      // explained again in Profile.
      await askForNotifications();
    }
    if (last) finish('/sign-up');
    else setIndex(index + 1);
  };

  return (
    <Screen
      footer={
        <>
          <Button label={step.primary.label} icon={step.primary.icon} onPress={next} />
          <Button
            label={last ? 'Continue as guest' : 'Not now'}
            variant="ghost"
            onPress={() => (last ? finish('/') : setIndex(index + 1))}
          />
        </>
      }>
      <View style={styles.topRow}>
        <Text variant="bodySmallStrong" color="textSecondary">
          {index + 1} of {steps.length}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => finish('/')} hitSlop={12}>
          <Text variant="bodyStrong" color="textBrand">
            Skip
          </Text>
        </Pressable>
      </View>

      <View style={styles.preview}>
        <View style={styles.previewIcon}>
          <step.icon size={34} color={Colors.textOnBrand} strokeWidth={1.75} />
        </View>
        {step.rows.map((row) => (
          <View key={row.title} style={styles.previewRow}>
            <IconBadge icon={row.icon} tone={row.tone} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{row.title}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {row.meta}
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.textSecondary} />
          </View>
        ))}
      </View>

      <StepDots count={steps.length} index={index} />
      <Text variant="titleLarge" accessibilityRole="header">
        {step.title}
      </Text>
      <Text variant="bodyLarge" color="textSecondary">
        {step.body}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  preview: {
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.55)',
    padding: 20,
    gap: 12,
    alignItems: 'stretch',
    ...Shadow.card,
  },
  previewIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.bgBrand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgSurface,
    ...Shadow.card,
  },
});
