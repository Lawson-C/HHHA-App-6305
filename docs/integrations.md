# External Integrations

The app talks to only two services: **Sanity** (content, read-only) and **Supabase** (auth, resident data). Every third-party data API is called **from Supabase Edge Functions only**, so keys stay in function secrets. The results are normalized into `environment_readings`, and the app reads them through `environment_latest()` / `environment_glance()`. The app never calls those APIs directly, apart from on-device OS services (location, maps rendering, push token registration).

| Integration | Purpose | Status | Notes |
| --- | --- | --- | --- |
| **Supabase** | Auth (email + password, ES256 JWTs), Postgres + RLS (resident data), Storage (`blight-photos`, `inquiry-attachments`), Edge Functions (`send-alert`, `send-reminders`, `sync-environment`), pg_cron + pg_net + Vault | Chosen (D-003, D-024) | Dev project `lxwkbstypsyiscjegvgp`. See `architecture.md` and `supabase/README.md` |
| **Sanity** | Content Lake (alerts, events, housing programs and listings, library, `appCopy`) + Sanity Studio for staff | Chosen (D-024) | Project `nxvenp1m`, public dataset `production`. The app reads the CDN API without a token. Studio in `studio/`, hosted with `sanity deploy`. A GROQ webhook on `alert` calls `send-alert` |
| **Expo Push Service** (`expo-notifications`) | Push delivery to iOS (APNs) and Android (FCM) | Chosen (D-007) | Sent from the Edge Functions (`send-alert`, `send-reminders`) only when `PUSH_ENABLED=true`. `EXPO_ACCESS_TOKEN` is needed only with enhanced push security. Requires an FCM v1 credential for Android and APNs keys through EAS credentials. Needs a dev or release build; push doesn't work in Expo Go on Android |
| **EPA AirNow API** | Current air quality (AQI) by lat/lng | Chosen, **key needed** | Free API key (airnowapi.org), set as the `AIRNOW_API_KEY` function secret. `sync-environment` polls every 30 min for the District 3 centroid (`DISTRICT_CENTROID`, default `33.759,-84.425`) and stores the worst pollutant. Skipped without a key |
| **Weather / temperature / heat** | Temperature, hourly forecast, heat index and heat advisories | Chosen: **NWS api.weather.gov** | Free, no key, but requires a contact `User-Agent`: the `NWS_USER_AGENT` function secret. NWS is skipped without it. Polled by `sync-environment` every 30 min. Heat advisories come from NWS active alerts for the point |
| **Heat zones (urban heat islands)** | Static map layer | Open (Q-009) | Candidates: City of Atlanta / NOAA heat-mapping campaign data. Probably a static GeoJSON imported by admins |
| **Water quality** | Stream/water quality | Open (Q-009) | Admins enter readings for now (`admin_add_environment_reading`). Candidates: USGS Water Data API (Proctor Creek gauges), EPA Water Quality Portal. Data may be sparse or delayed, so show `observedAt` clearly |
| **Mosquito-prone areas** | Risk areas | Open (Q-009) | Admins enter readings for now. Likely no public API. Probably admin-curated or community-reported areas (the client brief allows "community-uploaded reports") |
| **9mile.us** | Building and tree-removal permits | Open (Q-008), post-MVP | Need to confirm API access, terms and cost with the client. Until then, list it as an unresolved dependency |
| **Maps** | Blight map, pins | Proposed: `expo-maps` (Apple Maps on iOS, Google Maps on Android) | Static map art for now (Q-014). Check the SDK 57 docs for the API and config plugin. Google Maps on Android needs an API key (restricted to the app's package and SHA-1) |
| **Geolocation** | Device location, reverse geocoding | `expo-location` | Foreground permission only |
| **Email** | Auth emails (confirm, reset) | Supabase built-in for dev | Production needs a custom SMTP provider (e.g. Resend/SendGrid), because Supabase's default sender is heavily rate-limited |
| **SMS** | Phone verification | Open (Q-002) | Twilio through Supabase Auth if the client wants it and accepts the cost |

## Failure behavior (applies to all data sources)
- On any fetch failure, `sync-environment` keeps the last good readings and logs the error (never the URL). The read functions report `stale: true` once `observedAt` is older than that category's threshold: AQI, temperature and heat 3 h; water and mosquito 7 days.
- A category with no reading at all comes back as `level: unknown`, "Data not available".
- The app shows "Data not available" or "Last updated <relative time>", never an empty or broken card.
