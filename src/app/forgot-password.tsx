import { Mail } from 'lucide-react-native';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { TopBar } from '@/components/ui/top-bar';
import { useAuth } from '@/lib/auth/auth-provider';
import { authErrorMessage } from '@/lib/auth/errors';
import { validateEmail } from '@/lib/auth/validation';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const problem = validateEmail(email);
    setError(problem);
    if (problem) return;
    setSubmitting(true);
    try {
      await resetPassword(email);
      // Same message whether or not the account exists (no account enumeration).
      setSent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <TopBar />
      <Text variant="display" accessibilityRole="header">
        Reset your password
      </Text>
      {sent ? (
        <Text variant="bodyLarge" color="textSecondary" accessibilityLiveRegion="polite">
          If there&apos;s an account for {email.trim()}, we sent a link to reset the password. The
          link works once and expires in an hour.
        </Text>
      ) : (
        <>
          <Text variant="bodyLarge" color="textSecondary">
            Enter the email you signed up with. We&apos;ll send you a link to choose a new password.
          </Text>
          <TextField
            label="Email"
            icon={Mail}
            value={email}
            onChangeText={setEmail}
            error={error}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Button label="Send reset link" onPress={submit} loading={submitting} />
        </>
      )}
    </Screen>
  );
}
