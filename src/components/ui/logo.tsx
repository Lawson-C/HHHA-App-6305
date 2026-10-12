import { Image } from 'expo-image';

const sources = {
  horizontal: require('@/assets/brand/logo-horizontal-color.png'),
  horizontalWhite: require('@/assets/brand/logo-horizontal-white.png'),
  verticalWhite: require('@/assets/brand/logo-vertical-white.png'),
  icon: require('@/assets/brand/logo-icon-color.png'),
};

const ratios = {
  horizontal: 403 / 120,
  horizontalWhite: 403 / 120,
  verticalWhite: 185 / 240,
  icon: 207 / 160,
};

/** Official Historic Hunter Hills logo (exported from the Figma brand section). */
export function Logo({
  variant = 'horizontal',
  height = 48,
}: {
  variant?: keyof typeof sources;
  height?: number;
}) {
  return (
    <Image
      source={sources[variant]}
      style={{ height, width: height * ratios[variant] }}
      contentFit="contain"
      accessibilityLabel="Hunter Hills"
      accessible
    />
  );
}
