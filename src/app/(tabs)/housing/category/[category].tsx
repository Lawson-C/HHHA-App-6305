import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { useHousingResources } from '@/lib/api/queries';
import type { HousingCategory } from '@/lib/api/types';
import { housingCategory } from '@/lib/labels';

/** Programs within one "Find help by need" category. */
export default function HousingCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: HousingCategory }>();
  const meta = housingCategory[category] ?? { label: 'Housing help', icon: undefined };
  const programs = useHousingResources(category);

  return (
    <Screen withTabBar>
      <TopBar title="Housing" />
      <Text variant="titleLarge" accessibilityRole="header">
        {meta.label}
      </Text>
      {programs.isPending ? (
        <LoadingState />
      ) : programs.isError ? (
        <ErrorState error={programs.error} onRetry={() => programs.refetch()} />
      ) : programs.data.length === 0 ? (
        <EmptyState
          title="No programs listed yet"
          message="The Foundation team is adding programs. Check back soon or call the housing help line."
        />
      ) : (
        <View style={styles.list}>
          {programs.data.map((p) => (
            <ListRow
              key={p.documentId}
              title={p.title}
              subtitle={p.summary}
              icon={meta.icon}
              onPress={() =>
                router.push({ pathname: '/program/[id]', params: { id: p.documentId } })
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: 10 } });
