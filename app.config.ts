import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with machine-specific values that shouldn't be committed.
 * - APPLE_TEAM_ID (10 characters, from your Apple Developer account) lets local Xcode builds
 *   sign automatically, so `npm run ios:device` works without EAS. See docs/development.md.
 * - When EXPO_PUBLIC_API_URL points at a computer on the local network (http://<name>.local
 *   or a private IP), the app needs iOS's local-network permission. Release builds strip
 *   Expo's dev-launcher text for it, so we add our own; production (https) builds skip this.
 */
function isLocalNetworkUrl(url: string | undefined) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return (
      hostname.endsWith('.local') ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const localApi = isLocalNetworkUrl(process.env.EXPO_PUBLIC_API_URL);
  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : null),
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(localApi
          ? {
              NSLocalNetworkUsageDescription:
                'Development build: Hunter Hills connects to the test server on your local network.',
            }
          : null),
      },
    },
  };
};
