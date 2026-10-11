# External Integrations

Every external API is called **from Strapi only**. Results are normalized into `environmental-reading` (or a feature-specific cache) and served to the app. The app never calls these services directly, except for on-device OS services (location, maps rendering, push token registration).

| Integration | Purpose | Status | Notes |
| --- | --- | --- | --- |
| **Supabase** | Auth, Postgres, Storage | Chosen | See `architecture.md` |
| **Expo Push Service** (`expo-notifications`) | Push delivery to iOS (APNs) and Android (FCM) | Chosen | Requires an FCM v1 credential for Android and APNs keys through EAS credentials. Needs a dev build; push doesn't work in Expo Go on Android |
| **EPA AirNow API** | Current air quality (AQI) by lat/lng | Chosen, **key needed** | Free API key (airnowapi.org). Rate-limited, so poll on a cron (e.g. every 30 min) for the District 3 centroid and cache |
| **Weather / temperature / heat** | Temperature, heat advisories | Proposed: **NWS api.weather.gov** | Free, no key, requires a `User-Agent` header. Heat advisories come from NWS alerts for the Fulton County zone |
| **Heat zones (urban heat islands)** | Static map layer | Open (Q-009) | Candidates: City of Atlanta / NOAA heat-mapping campaign data. Probably a static GeoJSON imported by admins |
| **Water quality** | Stream/water quality | Open (Q-009) | Candidates: USGS Water Data API (Proctor Creek gauges), EPA Water Quality Portal. Data may be sparse or delayed, so show `observedAt` clearly |
| **Mosquito-prone areas** | Risk areas | Open (Q-009) | Likely no public API. Probably admin-curated or community-reported areas (the client brief allows "community-uploaded reports") |
| **9mile.us** | Building and tree-removal permits | Open (Q-008), post-MVP | Need to confirm API access, terms and cost with the client. Until then, list it as an unresolved dependency |
| **Maps** | Blight map, pins | Proposed: `expo-maps` (Apple Maps on iOS, Google Maps on Android) | Check the SDK 57 docs for the API and config plugin. Google Maps on Android needs an API key (restricted to the app's package and SHA-1) |
| **Geolocation** | Device location, reverse geocoding | `expo-location` | Foreground permission only |
| **Email** | Auth emails (confirm, reset) | Supabase built-in for dev | Production needs a custom SMTP provider (e.g. Resend/SendGrid), because Supabase's default sender is heavily rate-limited |
| **SMS** | Phone verification | Open (Q-002) | Twilio through Supabase Auth if the client wants it and accepts the cost |

## Failure behavior (applies to all data sources)
- On any fetch failure, keep the last good reading, set `environmental-source.lastError`, and let the API report `stale: true` when `observedAt` is older than that category's threshold (AQI 3 h, weather 3 h, others 7 days).
- The app shows "Data not available" or "Last updated <relative time>" and never an empty or broken card.
