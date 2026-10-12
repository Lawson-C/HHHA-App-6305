import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with machine-specific values that shouldn't be committed.
 * APPLE_TEAM_ID (from your Apple Developer account, 10 characters) lets local Xcode builds
 * sign automatically, so `npm run device:ios` works without EAS. See docs/development.md.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : null),
  },
});
