import { router } from 'expo-router';
import { LockKeyhole, Mail, Phone, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { TopBar } from '@/components/ui/top-bar';
import { useAuth } from '@/lib/auth/auth-provider';
import { authErrorMessage } from '@/lib/auth/errors';
import {
  normalizePhone,
  PASSWORD_RULE,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from '@/lib/auth/validation';

type Fields = 'fullName' | 'email' | 'phone' | 'password' | 'confirm';

function validate(values: Record<Fields, string>): Partial<Record<Fields, string>> {
  const errors: Partial<Record<Fields, string>> = {};
  const set = (key: Fields, msg: string | null) => {
    if (msg) errors[key] = msg;
  };
  set('fullName', validateFullName(values.fullName));
  set('email', validateEmail(values.email));
  set('phone', validatePhone(values.phone));
  set('password', validatePassword(values.password));
  if (!errors.password && values.confirm !== values.password)
    errors.confirm = "Passwords don't match.";
  return errors;
}

/** Create account (docs/design/user-flows.md §1). */
export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [values, setValues] = useState<Record<Fields, string>>({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const update = (key: Fields) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const blur = (key: Fields) => () => {
    if (!values[key]) return;
    const next = validate(values);
    setErrors((e) => ({ ...e, [key]: next[key] }));
  };

  const submit = async () => {
    if (submitting) return;
    const next = validate(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const { needsConfirmation } = await signUp({
        fullName: values.fullName,
        email: values.email,
        phone: normalizePhone(values.phone)!,
        password: values.password,
      });
      if (needsConfirmation) setCheckEmail(true);
      else router.dismissTo('/');
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (checkEmail) {
    return (
      <Screen>
        <TopBar leading="close" onLeadingPress={() => router.dismissTo('/')} />
        <Text variant="display" accessibilityRole="header">
          Check your email
        </Text>
        <Text variant="bodyLarge" color="textSecondary">
          If {values.email.trim()} can be used for a new account, we sent a link to confirm it. Open
          the link, then come back and sign in.
        </Text>
        <Button label="Go to sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label="Create account"
          onPress={submit}
          loading={submitting}
          testID="sign-up-submit"
        />
      }>
      <TopBar />
      <Text variant="display" accessibilityRole="header">
        Create your account
      </Text>
      <Text variant="body" color="textSecondary">
        You can browse without an account. You need one to report issues, set reminders and ask for
        housing help.
      </Text>
      <TextField
        label="Full name"
        icon={UserRound}
        value={values.fullName}
        onChangeText={update('fullName')}
        onBlur={blur('fullName')}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Email"
        icon={Mail}
        value={values.email}
        onChangeText={update('email')}
        onBlur={blur('email')}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Phone number"
        icon={Phone}
        value={values.phone}
        onChangeText={update('phone')}
        onBlur={blur('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="(404) 555-0142"
      />
      <TextField
        label="Password"
        icon={LockKeyhole}
        value={values.password}
        onChangeText={update('password')}
        onBlur={blur('password')}
        error={errors.password}
        helper={PASSWORD_RULE}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Confirm password"
        icon={LockKeyhole}
        value={values.confirm}
        onChangeText={update('confirm')}
        onBlur={blur('confirm')}
        error={errors.confirm}
        secureTextEntry
        textContentType="newPassword"
      />
      {formError ? (
        <Card style={styles.errorCard}>
          <Text variant="bodySmallStrong" color="danger" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        </Card>
      ) : null}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.replace('/sign-in')}
        style={styles.link}>
        <Text variant="body" color="textSecondary">
          Already have an account?{' '}
          <Text variant="bodyStrong" color="textBrand">
            Sign in
          </Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorCard: { borderWidth: 1, borderColor: '#f9e4db' },
  link: { alignSelf: 'center', paddingVertical: 8 },
});
