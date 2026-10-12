import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/**
 * Renders the small Markdown subset library articles use: `## headings`, `- bullets` and
 * paragraphs. Anything else shows as plain text. Bullets under a heading containing
 * "warning" get the alert icon, as in the Figma article.
 */
type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[]; warning: boolean }
  | { kind: 'paragraph'; text: string };

/** Parse once, outside render, so "under a warning heading" is plain data. */
export function parseMarkdown(source: string): Block[] {
  let warning = false;
  return source
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block): Block => {
      if (block.startsWith('## ')) {
        const text = block.slice(3).trim();
        warning = /warning/i.test(text);
        return { kind: 'heading', text };
      }
      const lines = block.split('\n');
      if (lines.every((l) => /^[-*] /.test(l))) {
        return { kind: 'list', items: lines.map((l) => l.slice(2)), warning };
      }
      return { kind: 'paragraph', text: block };
    });
}

export function SimpleMarkdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <View style={styles.root}>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <Text key={i} variant="titleMedium" accessibilityRole="header" style={styles.heading}>
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'list') {
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item) => (
                <View key={item} style={styles.bullet}>
                  {block.warning ? (
                    <CircleAlert size={20} color={Colors.warning} style={styles.icon} />
                  ) : (
                    <View style={styles.dot} />
                  )}
                  <Text variant="bodyLarge" style={styles.flex}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} variant="bodyLarge">
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  heading: { marginTop: 6 },
  list: { gap: 10 },
  bullet: { flexDirection: 'row', gap: 12 },
  icon: { marginTop: 3 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textBrand,
    marginTop: 11,
    marginHorizontal: 7,
  },
  flex: { flex: 1 },
});
