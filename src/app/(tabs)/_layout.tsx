import { Redirect, Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { useAuth } from '@/lib/auth/auth-provider';

export default function TabsLayout() {
  const { session, hasSeenWelcome } = useAuth();

  // First launch: show the welcome flow before the app (Figma "01 · Onboarding").
  if (!session && !hasSeenWelcome) return <Redirect href="/welcome" />;

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="events" />
      <Tabs.Screen name="housing" />
      <Tabs.Screen name="library" />
    </Tabs>
  );
}
