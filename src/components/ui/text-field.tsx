import type { LucideIcon } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors, FontFamily, Radius } from '@/constants/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  icon?: LucideIcon;
  error?: string | null;
  helper?: string;
};

/** Labeled input with focus (brand) and error (clay) borders, per the Figma "Text Field". */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, icon: Icon, error, helper, multiline, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? Colors.danger : focused ? Colors.borderBrand : Colors.borderStrong;
  return (
    <View style={styles.wrap}>
      <Text variant="bodySmallStrong" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          { borderColor, borderWidth: focused || error ? 2 : 1 },
        ]}>
        {Icon ? <Icon size={20} color={Colors.textPrimary} strokeWidth={2} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={Colors.textDisabled}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="bodySmall" color="textSecondary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 15 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgSurface,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: 12 },
  input: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: 17,
    color: Colors.textPrimary,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top', paddingVertical: 4 },
});
