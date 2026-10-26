import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Radius } from '@/constants/theme';
import { createBlightReport } from '@/lib/api';
import { keys } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/auth-provider';
import { blightCategory } from '@/lib/labels';
import { useReportDraft } from '@/lib/report-draft';

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodySmallStrong" color="textSecondary">
          {label}
        </Text>
        <Text variant="body">{value}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label.toLowerCase()}`}
        onPress={onEdit}
        hitSlop={10}>
        <Text variant="bodySmallStrong" color="textBrand">
          Edit
        </Text>
      </Pressable>
    </View>
  );
}

/** Review step before submitting (docs/design/user-flows.md §2, step 6). */
export default function ReviewReportScreen() {
  const { draft, setSubmitted } = useReportDraft();
  const { session } = useAuth();
  const client = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!session) {
      router.push('/sign-in');
      return;
    }
    if (!draft.category || !draft.location) return;
    setSubmitting(true);
    setError(null);
    try {
      const report = await createBlightReport({
        category: draft.category,
        description: draft.description.trim(),
        latitude: draft.location.latitude,
        longitude: draft.location.longitude,
        address: draft.location.address,
        keepNamePrivate: draft.keepNamePrivate,
        photos: draft.photos,
      });
      setSubmitted(report);
      client.invalidateQueries({ queryKey: keys.myReports });
      router.replace('/report/submitted');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {!session ? (
            <Text variant="bodySmall" color="textSecondary" style={{ textAlign: 'center' }}>
              You&apos;ll sign in before we send it. Your report stays filled in.
            </Text>
          ) : null}
          <Button
            label={session ? 'Submit report' : 'Sign in to submit'}
            onPress={submit}
            loading={submitting}
          />
        </>
      }>
      <TopBar title="Review" />
      <Text variant="titleLarge" accessibilityRole="header">
        Does this look right?
      </Text>
      <Card padded={false}>
        <Row
          label="Type"
          value={draft.category ? blightCategory[draft.category].label : '—'}
          onEdit={() => router.dismissTo('/report')}
        />
        <Divider inset={16} />
        <Row
          label="Location"
          value={draft.location?.address ?? 'Location set'}
          onEdit={() => router.back()}
        />
        <Divider inset={16} />
        <Row
          label="Description"
          value={draft.description.trim() || 'None'}
          onEdit={() => router.back()}
        />
        <Divider inset={16} />
        <Row
          label="Name"
          value={draft.keepNamePrivate ? 'Kept private from the City' : 'Shared with the City'}
          onEdit={() => router.back()}
        />
      </Card>
      <View style={styles.photos}>
        {draft.photos.map((p) => (
          <Image key={p.uri} source={{ uri: p.uri }} style={styles.photo} contentFit="cover" />
        ))}
      </View>
      {error ? (
        <Text variant="bodySmallStrong" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: Radius.sm },
});
