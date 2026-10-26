import {
  Assistant_400Regular,
  Assistant_600SemiBold,
  Assistant_700Bold,
} from '@expo-google-fonts/assistant';
import { FrankRuhlLibre_700Bold } from '@expo-google-fonts/frank-ruhl-libre';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { queryClient } from '@/lib/api/queries';
import { AuthProvider, useAuth } from '@/lib/auth/auth-provider';
import { useNotificationNavigation, usePushRegistration } from '@/lib/push';

SplashScreen.preventAutoHideAsync();
// Fade from the splash into the app instead of cutting.
SplashScreen.setOptions({ fade: true, duration: 300 });

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.bgBrand,
    background: Colors.bgCanvas,
    card: Colors.bgSurface,
    text: Colors.textPrimary,
    border: Colors.borderDefault,
  },
};

function RootNavigator() {
  const { session, isAdmin, isLoading, hasSeenWelcome } = useAuth();
  // Ask for notifications once the person is past the welcome flow, not on top of it.
  usePushRegistration(isLoading ? null : (session?.userId ?? 'guest'), hasSeenWelcome);
  const [fontsLoaded] = useFonts({
    FrankRuhlLibre_700Bold,
    Assistant_400Regular,
    Assistant_600SemiBold,
    Assistant_700Bold,
  });
  const ready = fontsLoaded && !isLoading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return <Navigator signedIn={Boolean(session)} isAdmin={isAdmin} />;
}

function Navigator({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  // Needs the navigator mounted, so it lives below the splash/loading gate.
  useNotificationNavigation();

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgCanvas } }}>
      <Stack.Screen name="(tabs)" />

      {/* Public screens outside the tab bar */}
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="program/[id]" />
      <Stack.Screen name="report" options={{ presentation: 'fullScreenModal' }} />

      {/* Account screens. Not guarded: a guard would yank them away the instant sign-in
          succeeds; instead they dismiss themselves with the normal animation. */}
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />

      {/* Only when signed in. The server enforces access again (AGENTS.md rule 2). */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="profile" />
        <Stack.Screen name="my-reports" />
        <Stack.Screen name="inquiry/[id]" options={{ presentation: 'modal' }} />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            <RootNavigator />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
