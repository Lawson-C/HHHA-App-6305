import { Info, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { Colors, MinTouch, PagePadding, Radius } from '@/constants/theme';

/** Bottom info sheet ("How reporting works", "Air quality index", "Data sources"). */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Info size={22} color={Colors.textBrand} />
          <Text variant="titleMedium" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}>
            <X size={22} color={Colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    backgroundColor: Colors.bgSurface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: PagePadding,
    maxHeight: '75%',
  },
  grabber: {
    alignSelf: 'flex-start',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    marginTop: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  title: { flex: 1 },
  close: {
    width: MinTouch,
    height: MinTouch,
    borderRadius: MinTouch / 2,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: 16, paddingBottom: 8 },
});
