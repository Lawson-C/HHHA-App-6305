import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { TopBar } from '@/components/ui/top-bar';
import { Colors } from '@/constants/theme';
import { createHousingInquiry } from '@/lib/api';
import { useHousingResource } from '@/lib/api/queries';

/** Housing inquiry form (docs/product.md F4, user story 2). */
export default function InquiryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const program = useHousingResource(id);
  const [message, setMessage] = useState('');
  const [preferredContact, setPreferredContact] = useState<'email' | 'phone'>('phone');
  const [error, setError] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      createHousingInquiry({ housingResource: id, message: message.trim(), preferredContact }),
  });

  const onSubmit = () => {
    if (message.trim().length < 10) {
      setError('Tell us a little about your situation (at least 10 characters).');
      return;
    }
    setError(null);
    submit.mutate();
  };

  if (submit.isSuccess) {
    return (
      <Screen footer={<Button label="Done" onPress={() => router.back()} />}>
        <View style={styles.done}>
          <CircleCheck size={56} color={Colors.success} />
          <Text variant="display" style={styles.center} accessibilityRole="header">
            Inquiry sent
          </Text>
          <Text variant="bodyLarge" color="textSecondary" style={styles.center}>
            The Foundation team will {preferredContact === 'phone' ? 'call' : 'email'} you within 2
            business days about {program.data?.title ?? 'this program'}.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Send inquiry" onPress={onSubmit} loading={submit.isPending} />}>
      <TopBar leading="close" title="Start inquiry" />
      <Text variant="titleLarge" accessibilityRole="header">
        {program.data?.title ?? 'Housing program'}
      </Text>
      <Text variant="body" color="textSecondary">
        Only you and the Foundation team can see what you send.
      </Text>
      <TextField
        label="How can we help?"
        value={message}
        onChangeText={setMessage}
        multiline
        error={error}
        placeholder="For example: I'm two months behind on rent and got a notice last week."
        maxLength={4000}
      />
      <View style={{ gap: 8 }}>
        <Text variant="bodySmallStrong">How should we contact you?</Text>
        <SegmentedControl
          value={preferredContact}
          onChange={setPreferredContact}
          options={[
            { value: 'phone', label: 'Phone' },
            { value: 'email', label: 'Email' },
          ]}
        />
      </View>
      {submit.isError ? (
        <Text variant="bodySmallStrong" color="danger">
          {(submit.error as Error).message}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: 'center', gap: 14, marginTop: 60 },
  center: { textAlign: 'center' },
});
