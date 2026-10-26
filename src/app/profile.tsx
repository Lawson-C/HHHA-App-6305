import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Globe,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPin,
  Camera,
  TriangleAlert,
  Type,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { ToggleRow } from '@/components/ui/toggle-row';
import { TopBar } from '@/components/ui/top-bar';
import { Colors } from '@/constants/theme';
import { updateMe } from '@/lib/api';
import type {
  Neighborhood,
  NotificationPreferences,
  ProfileUpdate,
  TextSize,
} from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-provider';
import { initials } from '@/lib/format';
import { useNotificationPermission } from '@/lib/push';
import { neighborhoods } from '@/lib/labels';
import { setTextSize, textScales, useTextSize } from '@/lib/text-scale';

/** Figma 08 · Profile */
export default function ProfileScreen() {
  const { profile, profileError, refreshProfile, setProfile, signOut, isAdmin, isDemo } = useAuth();
  const textSize = useTextSize();
  const notifications = useNotificationPermission();
  const [sheet, setSheet] = useState<'neighborhood' | 'textSize' | null>(null);

  // Leave the screen first, then sign out once the transition has played; signing out first
  // would make the signed-in-only route disappear with a hard cut.
  const signOutAndLeave = () => {
    router.dismissTo('/');
    setTimeout(() => signOut(), 400);
  };
  const save = useMutation({
    mutationFn: (update: ProfileUpdate) => updateMe(update),
    onSuccess: (next) => setProfile(next),
  });

  if (!profile) {
    return (
      <Screen>
        <TopBar title="Profile" />
        {profileError ? (
          <>
            <ErrorState
              error={
                (profileError as { status?: number }).status === 403
                  ? new Error('Your account is suspended. Contact the Foundation team for help.')
                  : profileError
              }
              onRetry={refreshProfile}
            />
            <Button label="Sign out" variant="outline" icon={LogOut} onPress={signOutAndLeave} />
          </>
        ) : (
          <LoadingState />
        )}
      </Screen>
    );
  }

  const prefs = profile.notificationPreferences;
  const togglePref = (key: keyof NotificationPreferences) => (value: boolean) => {
    // Optimistic: flip locally, then save. Roll back on failure.
    const previous = profile;
    setProfile({ ...profile, notificationPreferences: { ...prefs, [key]: value } });
    save.mutate(
      { notificationPreferences: { [key]: value } },
      { onError: () => setProfile(previous) },
    );
  };

  const chooseTextSize = (size: TextSize) => {
    setTextSize(size);
    save.mutate({ textSize: size });
    setSheet(null);
  };

  const chooseNeighborhood = (neighborhood: Neighborhood) => {
    setProfile({ ...profile, neighborhood });
    save.mutate({ neighborhood });
    setSheet(null);
  };

  return (
    <Screen>
      <TopBar title="Profile" />
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text variant="titleMedium" color="textOnBrand">
            {initials(profile.fullName)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="titleLarge">{profile.fullName}</Text>
          <Text variant="body" color="textSecondary">
            {profile.neighborhood
              ? neighborhoods[profile.neighborhood].label
              : (profile.email ?? '')}
          </Text>
          <Tag label={profile.role === 'admin' ? 'Admin' : 'Resident'} tone="brand" />
        </View>
      </View>

      {isDemo ? (
        <Card style={styles.demo}>
          <Text variant="bodySmall" color="textSecondary">
            Demo mode: sign-in is simulated on this device and changes aren&apos;t saved to a
            server.
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Notifications" />
      {notifications.status === 'denied' || notifications.status === 'undetermined' ? (
        <Card style={styles.notifOff}>
          <Text variant="bodyStrong">Notifications are off on this phone</Text>
          <Text variant="bodySmall" color="textSecondary">
            You won&apos;t get any alerts, including emergencies, until you turn them on.
          </Text>
          <Button
            label={notifications.status === 'denied' ? 'Open Settings' : 'Turn on notifications'}
            size="small"
            onPress={notifications.enable}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}
      <Card padded={false}>
        <ToggleRow
          icon={TriangleAlert}
          title="Emergency alerts"
          description="Always on for your safety"
          value
          disabled
        />
        <Divider inset={52} />
        <ToggleRow
          icon={HeartPulse}
          title="Health warnings"
          description="Heat, air quality, spraying"
          value={prefs.healthWarnings}
          onValueChange={togglePref('healthWarnings')}
        />
        <Divider inset={52} />
        <ToggleRow
          icon={Users}
          title="Community announcements"
          value={prefs.communityAnnouncements}
          onValueChange={togglePref('communityAnnouncements')}
        />
        <Divider inset={52} />
        <ToggleRow
          icon={Landmark}
          title="Meeting reminders"
          description="A day before civic meetings"
          value={prefs.meetingReminders}
          onValueChange={togglePref('meetingReminders')}
        />
      </Card>
      {save.isError ? (
        <Text variant="bodySmall" color="danger">
          Couldn&apos;t save that change. {(save.error as Error).message}
        </Text>
      ) : null}

      <SectionHeader title="Preferences" />
      <View style={{ gap: 10 }}>
        <ListRow
          icon={Type}
          title="Text size"
          subtitle={textScales[textSize].label}
          onPress={() => setSheet('textSize')}
        />
        <ListRow icon={Globe} title="Language" subtitle="English (Spanish coming soon)" />
        <ListRow
          icon={MapPin}
          title="My neighborhood"
          subtitle={profile.neighborhood ? neighborhoods[profile.neighborhood].label : 'Not set'}
          onPress={() => setSheet('neighborhood')}
        />
        <ListRow icon={Camera} title="My reports" onPress={() => router.push('/my-reports')} />
        {isAdmin ? (
          <ListRow
            icon={LayoutDashboard}
            title="Admin dashboard"
            subtitle="Reports, alerts and users"
            onPress={() => router.push('/admin')}
          />
        ) : null}
      </View>

      <Button label="Sign out" icon={LogOut} variant="outline" onPress={signOutAndLeave} />

      <Sheet visible={sheet === 'textSize'} title="Text size" onClose={() => setSheet(null)}>
        {(Object.keys(textScales) as TextSize[]).map((size) => (
          <Pressable
            key={size}
            accessibilityRole="radio"
            accessibilityState={{ checked: size === textSize }}
            onPress={() => chooseTextSize(size)}
            style={[styles.option, size === textSize && styles.optionSelected]}>
            <Text variant="bodyStrong" style={{ fontSize: 16 * textScales[size].scale }}>
              {textScales[size].label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <Sheet
        visible={sheet === 'neighborhood'}
        title="My neighborhood"
        onClose={() => setSheet(null)}>
        {(Object.keys(neighborhoods) as Neighborhood[]).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: n === profile.neighborhood }}
            onPress={() => chooseNeighborhood(n)}
            style={[styles.option, n === profile.neighborhood && styles.optionSelected]}>
            <Text variant="bodyStrong">{neighborhoods[n].label}</Text>
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.bgBrand,
    borderWidth: 3,
    borderColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demo: { backgroundColor: Colors.bgBrandFaint },
  notifOff: { gap: 8, backgroundColor: Colors.warningSubtle },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12 },
  optionSelected: { backgroundColor: Colors.bgBrandSubtle },
});
