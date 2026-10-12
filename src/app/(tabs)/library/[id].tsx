import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, FileText, Play, Share2 } from 'lucide-react-native';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { SimpleMarkdown } from '@/components/simple-markdown';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { Colors, Radius, Tones } from '@/constants/theme';
import { useLibraryResource } from '@/lib/api/queries';
import { libraryCategory, resourceType } from '@/lib/labels';

/** Figma 07 · Library Article */
export default function LibraryArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, isPending, isError, error, refetch } = useLibraryResource(id);

  const openLink = () => r?.url && WebBrowser.openBrowserAsync(r.url);
  const title = r
    ? r.resourceType === 'video'
      ? 'Video'
      : r.resourceType === 'link'
        ? 'Link'
        : 'Article'
    : '';

  return (
    <Screen withTabBar>
      <TopBar title={title} />
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {r.resourceType === 'video' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play video: ${r.title}`}
              onPress={openLink}
              style={[
                styles.hero,
                { backgroundColor: Tones[libraryCategory[r.category].tone].bg },
              ]}>
              <View style={styles.play}>
                <Play size={28} color={Colors.warning} />
              </View>
            </Pressable>
          ) : null}
          <View style={{ gap: 10 }}>
            <Text variant="display" accessibilityRole="header">
              {r.title}
            </Text>
            <Tag
              label={libraryCategory[r.category].label}
              tone={libraryCategory[r.category].tone}
            />
            <Text variant="body" color="textSecondary">
              {[
                r.source,
                r.durationMinutes
                  ? `${r.durationMinutes} min ${resourceType[r.resourceType].label.toLowerCase()}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <View style={styles.actions}>
            <Button
              label="Share"
              icon={Share2}
              variant="outline"
              size="small"
              onPress={() => Share.share({ message: r.url ? `${r.title}: ${r.url}` : r.title })}
            />
            {r.url && r.resourceType !== 'video' ? (
              <Button
                label="Open link"
                icon={ExternalLink}
                variant="secondary"
                size="small"
                onPress={openLink}
              />
            ) : null}
          </View>
          {r.body ? (
            <SimpleMarkdown source={r.body} />
          ) : (
            <View style={styles.noBody}>
              <FileText size={20} color={Colors.textSecondary} />
              <Text variant="bodyLarge" style={{ flex: 1 }}>
                {r.description}
              </Text>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 170, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  noBody: { flexDirection: 'row', gap: 12 },
});
