/**
 * Design tokens, mirrored from the Figma "Design Reference" file
 * (🎨 Design System → Foundations). Change values here only.
 * Figma variable names are kept in comments so the two stay in sync.
 */

const palette = {
  deepGreen900: '#0e3a20',
  deepGreen700: '#1a6232',
  leafGreen600: '#2e7f3b',
  leafGreen500: '#49b758',
  lightGreen300: '#96d098',
  lightGreen100: '#ddefd9',
  lightGreen50: '#eff7ed',
  creekBlue700: '#15668c',
  creekBlue500: '#45b8ea',
  skyBlue300: '#a2def9',
  skyBlue100: '#e3f4fc',
  neutral0: '#ffffff',
  neutral25: '#f5f7f5',
  neutral50: '#ebefec',
  neutral200: '#dce2dd',
  neutral400: '#929b95',
  neutral600: '#4f5a53',
  neutral900: '#141e18',
  clay600: '#b4462a',
  clay100: '#f9e4db',
  amber600: '#8c5b0e',
  amber100: '#f9ebcd',
  slate600: '#44507a',
  slate100: '#e5e8f2',
  containerGreen800: '#1f3b2c',
  containerGreen700: '#2a4d3a',
  containerGreen200: '#b8d0bb',
  containerGreen50: '#eef6ec',
} as const;

/** Semantic colors (Figma collection "Color", mode "Light"). */
export const Colors = {
  bgCanvas: palette.neutral25, // bg/canvas
  bgSurface: palette.neutral0, // bg/surface
  bgSunken: palette.neutral50, // bg/sunken
  bgBrand: palette.deepGreen700, // bg/brand
  bgBrandStrong: palette.deepGreen900, // bg/brand-strong
  bgBrandSubtle: palette.lightGreen100, // bg/brand-subtle
  bgBrandFaint: palette.lightGreen50, // bg/brand-faint
  bgBrandContainer: palette.containerGreen700, // bg/brand-container
  bgBrandContainerStrong: palette.containerGreen800, // bg/brand-container-strong

  textPrimary: palette.neutral900, // text/primary
  textSecondary: palette.neutral600, // text/secondary
  textDisabled: palette.neutral400, // text/disabled
  textBrand: palette.deepGreen700, // text/brand
  textOnBrand: palette.neutral0, // text/on-brand
  textOnBrandMuted: palette.lightGreen100, // text/on-brand-muted
  textOnBrandContainer: palette.containerGreen50, // text/on-brand-container
  textOnBrandContainerMuted: palette.containerGreen200, // text/on-brand-container-muted

  borderDefault: palette.neutral200, // border/default
  borderStrong: palette.neutral400, // border/strong
  borderBrand: palette.deepGreen700, // border/brand

  danger: palette.clay600, // status/danger
  dangerSubtle: palette.clay100,
  warning: palette.amber600, // status/warning
  warningSubtle: palette.amber100,
  info: palette.creekBlue700, // status/info
  infoSubtle: palette.skyBlue100,
  success: palette.leafGreen600, // status/success
  successSubtle: palette.lightGreen100,

  accentLeaf: palette.leafGreen500, // accent/leaf
  accentLightGreen: palette.lightGreen300,
  accentCreek: palette.creekBlue500,
  accentSky: palette.skyBlue300,

  /** Modal scrim behind bottom sheets. */
  scrim: 'rgba(20, 30, 24, 0.45)',
} as const;

export type ColorToken = keyof typeof Colors;

/** Tone pairs used by tags, icon badges and category markers. */
export const Tones = {
  brand: { fg: Colors.textBrand, bg: Colors.bgBrandSubtle },
  success: { fg: Colors.success, bg: Colors.successSubtle },
  info: { fg: Colors.info, bg: Colors.infoSubtle },
  warning: { fg: Colors.warning, bg: Colors.warningSubtle },
  danger: { fg: Colors.danger, bg: Colors.dangerSubtle },
  civic: { fg: palette.slate600, bg: palette.slate100 },
  neutral: { fg: Colors.textSecondary, bg: Colors.bgSunken },
} as const;

export type Tone = keyof typeof Tones;

/** Figma collection "Spacing & Radius". */
export const Space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32 } as const;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

/** Horizontal page padding used by every screen in the prototype. */
export const PagePadding = 20;

/** Font family names registered in `src/constants/fonts.ts`. */
export const FontFamily = {
  serifBold: 'FrankRuhlLibre_700Bold',
  sans: 'Assistant_400Regular',
  sansSemiBold: 'Assistant_600SemiBold',
  sansBold: 'Assistant_700Bold',
} as const;

/** Figma text styles. Frank Ruhl Libre for display/titles, Assistant for UI text. */
export const Typography = {
  display: { fontFamily: FontFamily.serifBold, fontSize: 34, lineHeight: 40 },
  titleLarge: { fontFamily: FontFamily.serifBold, fontSize: 28, lineHeight: 34 },
  titleMedium: { fontFamily: FontFamily.serifBold, fontSize: 22, lineHeight: 28 },
  titleSmall: { fontFamily: FontFamily.sansBold, fontSize: 18, lineHeight: 24 },
  numericHero: { fontFamily: FontFamily.serifBold, fontSize: 52, lineHeight: 56 },
  bodyLarge: { fontFamily: FontFamily.sans, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: FontFamily.sans, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: FontFamily.sansBold, fontSize: 16, lineHeight: 23 },
  bodySmall: { fontFamily: FontFamily.sans, fontSize: 14, lineHeight: 20 },
  bodySmallStrong: { fontFamily: FontFamily.sansBold, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: FontFamily.sansBold, fontSize: 17, lineHeight: 22 },
  tab: { fontFamily: FontFamily.sansBold, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: FontFamily.sansBold, fontSize: 13, lineHeight: 18 },
} as const;

export type TypographyVariant = keyof typeof Typography;

/** Soft card elevation from the prototype ("Foundations — elevation"). */
export const Shadow = {
  card: {
    shadowColor: '#0e3a20',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0e3a20',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/** Minimum touch target (docs/design/ui-spec.md). */
export const MinTouch = 44;

/** Space reserved at the bottom of tab screens for the floating tab bar. */
export const TabBarClearance = 110;
