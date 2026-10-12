import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { Colors, FontFamily, Radius } from '@/constants/theme';

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Search size={20} color={Colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(235,239,236,0.9)',
  },
  input: { flex: 1, fontFamily: FontFamily.sans, fontSize: 17, color: Colors.textPrimary },
});
