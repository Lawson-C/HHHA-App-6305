import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, ExternalLink, FileText, Phone } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Appear } from '@/components/ui/appear';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Colors } from '@/constants/theme';
import { useHousingResource } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatPhone } from '@/lib/format';

function Checklist({
  title,
  items,
  icon: Icon,
}: {
  title: string;
  items: string[];
  icon: typeof CircleCheck;
}) {
  return (
    <Card style={styles.listCard}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {title}
      </Text>
      {items.length ? (
        items.map((item) => (
          <View key={item} style={styles.item}>
            <Icon
              size={20}
              color={Icon === CircleCheck ? Colors.success : Colors.textSecondary}
              style={{ marginTop: 2 }}
            />
            <Text variant="body" style={{ flex: 1 }}>
              {item}
            </Text>
          </View>
        ))
      ) : (
        <Text variant="body" color="textSecondary">
          Not available yet. Call or start an inquiry to ask.
        </Text>
      )}
    </Card>
  );
}

/** Figma 05 · Housing Program */
export default function ProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data: program, isPending, isError, error, refetch } = useHousingResource(id);

  const startInquiry = () => {
    if (!session) router.push('/sign-in');
    else router.push({ pathname: '/inquiry/[id]', params: { id } });
  };

  return (
    <Screen
      footer={
        program ? (
          <View style={styles.footer}>
            {program.contactPhone ? (
              <Button
                label="Call"
                icon={Phone}
                variant="outline"
                style={styles.footerButton}
                onPress={() => Linking.openURL(`tel:${program.contactPhone}`)}
              />
            ) : null}
            {program.acceptsInquiries ? (
              <Button label="Start inquiry" style={styles.footerButton} onPress={startInquiry} />
            ) : null}
          </View>
        ) : null
      }>
      <TopBar title="Program" />
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Appear>
          <>
            <View style={{ gap: 10 }}>
              <Text variant="display" accessibilityRole="header">
                {program.title}
              </Text>
              <Text variant="bodyLarge" color="textSecondary">
                {program.summary}
              </Text>
            </View>
            {program.highlights.length ? (
              <View style={styles.highlights}>
                {program.highlights.slice(0, 3).map((h) => (
                  <Card key={h.label} style={styles.highlight}>
                    <Text
                      variant="titleMedium"
                      color="textBrand"
                      numberOfLines={1}
                      adjustsFontSizeToFit>
                      {h.value}
                    </Text>
                    <Text variant="bodySmall" color="textSecondary">
                      {h.label}
                    </Text>
                  </Card>
                ))}
              </View>
            ) : null}
            <Checklist title="Who can apply" items={program.eligibility} icon={CircleCheck} />
            <Checklist title="What you'll need" items={program.requiredMaterials} icon={FileText} />
            {program.contactName || program.contactPhone || program.website ? (
              <Card style={styles.listCard}>
                <Text variant="bodyStrong">Contact</Text>
                {program.contactName ? <Text variant="body">{program.contactName}</Text> : null}
                {program.contactPhone ? (
                  <Text variant="body" color="textSecondary">
                    {formatPhone(program.contactPhone)}
                  </Text>
                ) : null}
                {program.website ? (
                  <Button
                    label="Visit website"
                    icon={ExternalLink}
                    variant="ghost"
                    size="small"
                    style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                    onPress={() => Linking.openURL(program.website!)}
                  />
                ) : null}
              </Card>
            ) : null}
          </>
        </Appear>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  highlights: { flexDirection: 'row', gap: 10 },
  highlight: { flex: 1, gap: 2, padding: 12 },
  listCard: { gap: 12 },
  item: { flexDirection: 'row', gap: 12 },
  footer: { flexDirection: 'row', gap: 12 },
  footerButton: { flex: 1 },
});
