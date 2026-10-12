import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Colors, Typography, type ColorToken, type TypographyVariant } from '@/constants/theme';
import { textScales, useTextSize } from '@/lib/text-scale';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorToken | (string & {});
};

/** All app text goes through this so the Figma text styles and text-size preference apply. */
export function Text({ variant = 'body', color = 'textPrimary', style, ...rest }: TextProps) {
  const resolved = color in Colors ? Colors[color as ColorToken] : color;
  const { scale } = textScales[useTextSize()];
  const base = Typography[variant];
  const sized =
    scale === 1
      ? base
      : { ...base, fontSize: base.fontSize * scale, lineHeight: base.lineHeight * scale };
  return <RNText maxFontSizeMultiplier={2} {...rest} style={[sized, { color: resolved }, style]} />;
}
