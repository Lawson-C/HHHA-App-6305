import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { Text } from '@/components/ui/text';
import { Colors, PagePadding } from '@/constants/theme';

/** Figma 01 · Welcome */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Image
        source={require('@/assets/art/district-portrait.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessible={false}
      />
      <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <Logo variant="verticalWhite" height={200} />
        <Text variant="bodyLarge" color="textOnBrandContainer" style={styles.tagline}>
          Alerts, help and events for English Avenue, Vine City and Hunter Hills, all in one place.
        </Text>
        <Button label="Get started" variant="inverse" onPress={() => router.push('/onboarding')} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sign-in')}
          style={styles.signIn}
          hitSlop={8}>
          <Text variant="body" color="textOnBrandContainer">
            Already have an account?{' '}
            <Text variant="bodyStrong" color="textOnBrand">
              Sign in
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgBrandContainer },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: PagePadding, gap: 20 },
  tagline: { marginTop: 4 },
  signIn: { alignSelf: 'center', paddingVertical: 8 },
});
