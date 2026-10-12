import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipRow } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { TopBar } from '@/components/ui/top-bar';
import { Tones } from '@/constants/theme';
import { sendNotification } from '@/lib/api/admin';
import type { AlertCategory } from '@/lib/api/types';
import { alertCategory } from '@/lib/labels';

const categories = (Object.keys(alertCategory) as AlertCategory[]).map((c) => ({
  value: c,
  label: alertCategory[c].label,
}));

/** Admin: compose and send a push alert (docs/design/user-flows.md §7). */
export default function SendAlertScreen() {
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<AlertCategory>('community_announcement');
  const [errors, setErrors] = useState<{ title?: string; message?: string }>({});
  const send = useMutation({
    mutationFn: () => sendNotification({ title: title.trim(), message: message.trim(), category }),
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: ['alerts'] });
      Alert.alert(
        'Alert sent',
        `Delivered to ${result.recipientCount} device${result.recipientCount === 1 ? '' : 's'}.`,
      );
      router.back();
    },
  });

  const submit = () => {
    const next = {
      title: !title.trim()
        ? 'Add a title.'
        : title.length > 65
          ? 'Keep the title under 65 characters.'
          : undefined,
      message: !message.trim() ? 'Add a message.' : undefined,
    };
    setErrors(next);
    if (next.title || next.message) return;
    if (category === 'emergency') {
      Alert.alert(
        'Send an emergency alert?',
        'Emergency alerts go to everyone, even people who turned other alerts off.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send to everyone', style: 'destructive', onPress: () => send.mutate() },
        ],
      );
    } else send.mutate();
  };

  return (
    <Screen footer={<Button label="Send alert" onPress={submit} loading={send.isPending} />}>
      <TopBar title="Send an alert" />
      <Text variant="bodySmallStrong">Category</Text>
      <ChipRow options={categories} value={category} onChange={setCategory} />
      {category === 'emergency' ? (
        <Card style={{ backgroundColor: Tones.danger.bg }}>
          <Text variant="bodySmallStrong" color="danger">
            Goes to everyone, even people who turned other alerts off.
          </Text>
        </Card>
      ) : (
        <Text variant="bodySmall" color="textSecondary">
          Only residents who turned on {alertCategory[category].label.toLowerCase()} alerts get a
          push.
        </Text>
      )}
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        maxLength={65}
      />
      <TextField
        label="Message"
        value={message}
        onChangeText={setMessage}
        error={errors.message}
        multiline
        maxLength={240}
      />
      {send.isError ? (
        <Text variant="bodySmallStrong" color="danger">
          {(send.error as Error).message}
        </Text>
      ) : null}
    </Screen>
  );
}
