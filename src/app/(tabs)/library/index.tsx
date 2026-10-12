import { router } from 'expo-router';
import { Play, Sparkles } from 'lucide-react-native';
import { useDeferredValue, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChipRow } from '@/components/ui/chip';
import { ListRow } from '@/components/ui/list-row';
import { PageTitle } from '@/components/ui/page-title';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useLibrary } from '@/lib/api/queries';
import type { LibraryCategory, LibraryResource } from '@/lib/api/types';
import { libraryCategory, resourceType } from '@/lib/labels';

type Filter = 'all' | LibraryCategory;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(['financial_tools', 'health', 'education', 'small_business'] as const).map((c) => ({
    value: c,
    label: libraryCategory[c].label,
  })),
];

const open = (r: LibraryResource) =>
  router.push({ pathname: '/library/[id]', params: { id: r.documentId } });

function subtitle(r: LibraryResource) {
  const parts = [resourceType[r.resourceType].label];
  if (r.durationMinutes) parts.push(`${r.durationMinutes} min`);
  else if (r.source) parts.push(r.source);
  parts.push(libraryCategory[r.category].label);
  return parts.join(' · ');
}

/** Figma 07 · Library */
export default function LibraryScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const resources = useLibrary(filter === 'all' ? undefined : filter, deferredSearch);
  const featured =
    filter === 'all' && !deferredSearch ? resources.data?.find((r) => r.featured) : undefined;
  const rest = (resources.data ?? []).filter((r) => r !== featured);

  return (
    <Screen withTabBar>
      <PageTitle title="Library" />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search articles, videos, links"
      />
      <ChipRow options={filters} value={filter} onChange={setFilter} />

      {featured ? (
        <View style={styles.featured}>
          <View style={styles.featuredLabel}>
            <Sparkles size={18} color={Colors.textBrand} />
            <Text variant="bodySmallStrong" color="textBrand">
              Start here
            </Text>
          </View>
          <Text variant="titleMedium">{featured.title}</Text>
          <Button
            label={`${featured.resourceType === 'video' ? 'Watch' : 'Read'}${featured.durationMinutes ? ` · ${featured.durationMinutes} min` : ''}`}
            icon={Play}
            size="small"
            style={styles.featuredButton}
            onPress={() => open(featured)}
          />
        </View>
      ) : null}

      <SectionHeader
        title={
          deferredSearch
            ? 'Results'
            : filter === 'all'
              ? 'Popular this week'
              : libraryCategory[filter].label
        }
      />
      {resources.isPending ? (
        <LoadingState />
      ) : resources.isError ? (
        <ErrorState error={resources.error} onRetry={() => resources.refetch()} />
      ) : rest.length === 0 ? (
        <EmptyState
          title={deferredSearch ? 'No matches' : 'Nothing here yet'}
          message={
            deferredSearch
              ? 'Try a different word.'
              : 'The Foundation team adds new resources often.'
          }
        />
      ) : (
        <View style={styles.list}>
          {rest.map((r) => (
            <ListRow
              key={r.documentId}
              title={r.title}
              subtitle={subtitle(r)}
              icon={resourceType[r.resourceType].icon}
              onPress={() => open(r)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  featured: {
    borderRadius: Radius.xl,
    padding: 20,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.6)',
    ...Shadow.card,
  },
  featuredLabel: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  featuredButton: { alignSelf: 'flex-start', marginTop: 4 },
  list: { gap: 10 },
});
