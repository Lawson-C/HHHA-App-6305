import type { Core } from '@strapi/strapi';

const numberList = (value: string, fallback: number[]): number[] => {
  const parts = String(value ?? '')
    .split(',')
    .map((part) => Number(part.trim()));
  return parts.length === fallback.length && parts.every(Number.isFinite) ? parts : fallback;
};

/**
 * App-specific settings. Read with strapi.config.get('hhha.<key>').
 */
const config = ({ env }: Core.Config.Shared.ConfigParams) => {
  const [minLat, minLng, maxLat, maxLng] = numberList(
    env('DISTRICT_BBOX', ''),
    // Generous box around Atlanta Council District 3 (west side). Override with DISTRICT_BBOX.
    [33.73, -84.49, 33.81, -84.37],
  );
  const [centroidLat, centroidLng] = numberList(env('DISTRICT_CENTROID', ''), [33.759, -84.425]);

  return {
    district: {
      bbox: { minLat, minLng, maxLat, maxLng },
      centroid: { lat: centroidLat, lng: centroidLng },
    },
    push: {
      // When false, notifications are stored and recipients counted, but nothing is sent to Expo.
      enabled: env.bool('PUSH_ENABLED', false),
      expoAccessToken: env('EXPO_ACCESS_TOKEN', ''),
      sendUrl: env('EXPO_PUSH_URL', 'https://exp.host/--/api/v2/push/send'),
    },
    environment: {
      // NWS (no key). AirNow runs whenever AIRNOW_API_KEY is set.
      syncEnabled: env.bool('ENVIRONMENT_SYNC_ENABLED', false),
      airnowApiKey: env('AIRNOW_API_KEY', ''),
      nwsUserAgent: env(
        'NWS_USER_AGENT',
        'HistoricHunterHillsApp/0.1 (placeholder: set NWS_USER_AGENT to a contact email)',
      ),
    },
  };
};

export default config;
