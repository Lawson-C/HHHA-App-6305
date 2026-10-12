import { router } from 'expo-router';
import { LockKeyhole, Mail } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/lib/auth/auth-provider';
import { authErrorMessage } from '@/lib/auth/errors';
import { validateEmail } from '@/lib/auth/validation';

type Audience = 'resident' | 'staff';

/** Figma 01 · Sign In */
export default function SignInScreen() {
  const { signIn, markWelcomeSeen, isDemo } = useAuth();
  const [audience, setAudience] = useState<Audience>('resident');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const emailProblem = validateEmail(email);
    setEmailError(emailProblem);
    if (emailProblem) return;
    if (!password) {
      setFormError('Enter your password.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn(email, password, { asStaff: audience === 'staff' });
      // The Protected guard removes this screen once signed in; go home explicitly as well.
      router.dismissTo('/');
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const continueAsGuest = () => {
    markWelcomeSeen();
    router.dismissTo('/');
  };

  return (
    <Screen>
      <View style={styles.logo}>
        <Logo height={60} />
      </View>
      <Text variant="display" accessibilityRole="header">
        Welcome back
      </Text>
      <SegmentedControl
        value={audience}
        onChange={setAudience}
        options={[
          { value: 'resident', label: 'Resident' },
          { value: 'staff', label: 'Volunteer / Staff' },
        ]}
      />
      {audience === 'staff' ? (
        <Text variant="bodySmall" color="textSecondary">
          {isDemo
            ? 'Demo mode: signing in as staff shows the admin tools.'
            : 'Use the account the Foundation set up for you. Admin tools appear after you sign in.'}
        </Text>
      ) : null}
      <TextField
        label="Email"
        icon={Mail}
        value={email}
        onChangeText={setEmail}
        onBlur={() => email && setEmailError(validateEmail(email))}
        error={emailError}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        icon={LockKeyhole}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/forgot-password')}
        hitSlop={8}>
        <Text variant="bodyStrong" color="textBrand">
          Forgot password?
        </Text>
      </Pressable>
      {formError ? (
        <Text variant="bodySmallStrong" color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Sign in" onPress={submit} loading={submitting} testID="sign-in-submit" />
        <Button label="Continue as guest" variant="outline" onPress={continueAsGuest} />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.replace('/sign-up')}
        style={styles.footerLink}
        hitSlop={8}>
        <Text variant="body" color="textSecondary">
          New here?{' '}
          <Text variant="bodyStrong" color="textBrand">
            Create an account
          </Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { marginTop: 12, alignItems: 'flex-start' },
  actions: { gap: 12 },
  footerLink: { alignSelf: 'center', paddingVertical: 8 },
});
