# API / Interfaces

> Changed 2026-10-19: the Strapi REST API is gone (D-024). The app now reads content from **Sanity** with GROQ, and reads and writes resident data in **Supabase** directly under Row Level Security.

Screens never call `fetch`, `sanityQuery` or `supabase` themselves. They use the TanStack Query hooks in `src/lib/api/queries.ts`, which call `src/lib/api/index.ts`:
- `content.ts`: Sanity, read-only.
- `resident.ts`: Supabase, as the signed-in user or a guest.
- `admin.ts`: Supabase, admin screens.

Every function also has a demo branch (`mock-data.ts`) for when its service isn't configured (D-016). Every failure is an `ApiError { status, name, message, details }` (`src/lib/api/client.ts`).

Dates are ISO-8601 UTC strings everywhere.

## 1. App ⇄ Sanity (content)

`src/lib/sanity.ts` sends `GET https://<EXPO_PUBLIC_SANITY_PROJECT_ID>.apicdn.sanity.io/v2026-10-19/data/query/<EXPO_PUBLIC_SANITY_DATASET>?query=…&$param=<JSON>`.

There's no token: the dataset is public (D-025). The CDN serves published documents only. Errors become `ApiError`:
- `status 0` / `NetworkError`: the server couldn't be reached.
- `SanityError`: any non-2xx response, with Sanity's error description.

A missing document becomes a plain `Error` with a friendly message ("This event is no longer listed.").

Queries (`src/lib/api/content.ts`). Each one projects `"documentId": _id`:

| Function | GROQ (abridged) | Returns |
| --- | --- | --- |
| `listAlerts(filter)` | `*[_type == "alert" && (!defined($categories) \|\| category in $categories)] \| order(sentAt desc)[0...50]` | `Alert[]`. Filters: `emergency` → `[emergency]`, `health` → `[health_warning]`, `community` → `[community_announcement, meeting_reminder]`, `all` → no filter |
| `getAlert(id)` | `*[_type == "alert" && _id == $id][0]` | `Alert` (`actionSteps` coalesced to `[]`) |
| `listEvents(month, types)` | `*[_type == "event" && startsAt >= $start && startsAt < $end && (count($types) == 0 \|\| eventType in $types)] \| order(startsAt asc)` | `CommunityEvent[]` for one calendar month (device time zone) |
| `getEventContent(id)` | `*[_type == "event" && _id == $id][0]` | `CommunityEvent`. `getEvent()` in `resident.ts` adds `hasReminder` / `reminderId` |
| `listHousingResources(category?)` | `*[_type == "housingProgram" && (!defined($category) \|\| category == $category)] \| order(title asc)` | `HousingResource[]`. `highlights`, `eligibility` and `requiredMaterials` are coalesced to `[]`, and `acceptsInquiries` / `inquiryAllowsAttachments` to `true` |
| `getHousingResource(id)` | same projection, by `_id` | `HousingResource` |
| `listHousingListings()` | `*[_type == "housingListing"] \| order(_createdAt desc)` with `"imageUrl": image.asset->url` | `HousingListing[]` |
| `listLibrary(category?, search?)` | `*[_type == "libraryResource" && (!defined($category) \|\| category == $category) && (!defined($q) \|\| [title, description] match ($q + "*"))] \| order(featured desc, title asc)` | `LibraryResource[]`. `body` (Portable Text) is converted to Markdown |
| `getLibraryResource(id)` | by `_id` | `LibraryResource` |
| `getAppCopy()` | `*[_id == "appCopy"][0]` | `AppCopy` (all fields optional; `{}` when missing). `useAppCopy()` in `src/lib/app-copy.ts` caches it on the device and fills blanks with `defaultCopy` |

## 2. App ⇄ Supabase

The client is `@supabase/supabase-js`, created in `src/lib/supabase.ts` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The session is stored in `expo-sqlite/localStorage`, and tokens refresh automatically only while the app is in the foreground. Requests run as `anon` (guest) or `authenticated` (signed in) and are checked by RLS. See `security.md`.

### Auth

| Action | Call |
| --- | --- |
| Sign up | `supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } })`. The `on_auth_user_created` trigger creates the `profiles` row |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` |
| Sign out | `supabase.auth.signOut()`. The push token is then re-registered as a guest token (unlinked) |
| Recovery | `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'historichunterhills://reset-password' })` |

### Tables and views

Legend: **G** = guest (`anon`), **R** = signed-in resident whose account is not blocked, **A** = admin. "own" = RLS limits rows to the caller.

| Object | Operation | Who | Notes / app function |
| --- | --- | --- | --- |
| `profiles` | select | R own (a blocked user can still read their own row), A all | `getMe()` |
| `profiles` | update | R own, A any | Only `full_name, phone, neighborhood, text_size, language, notif_*` (column grants + `profiles_guard`). `updateMe()` |
| `public_blight_reports` | select | G, R, A | Active reports, no reporter columns. Photo URLs: `storage.from('blight-photos').getPublicUrl(path)` |
| `blight_reports` | select | R own (all statuses), A all | `listMyReports()`, `listReportsForModeration()` |
| `blight_reports` | insert | R | Columns `category, description, latitude, longitude, address, keep_name_private`. The trigger forces reporter and status. `createBlightReport()` |
| `blight_reports` | update | A | Moderation: `status`, `resolution_note` and the content columns. `updateReportStatus()`. No delete; `status = removed` is the soft delete |
| `blight_report_photos` | select / insert / delete | select: with the report. Insert: R reporter (≤ 5, while `submitted` and < 24 h old, object must exist). Delete: A | |
| `event_reminders` | select / insert / delete | R own (admins too, own only) | Insert columns `event_id, event_title, event_starts_at`. `getEvent()`, `setReminder()`, `removeReminder()` |
| `housing_inquiries` | insert | R | Columns `housing_program_id, housing_program_title, message, preferred_contact`. `createHousingInquiry()` |
| `housing_inquiries` | select | R own, A all | All columns **except** `admin_notes`. List columns explicitly, because `select=*` fails |
| `housing_inquiries` | update | A | `status`, `admin_notes` |
| `admin_housing_inquiries` (view) | select | A (empty for others) | Adds `admin_notes`, resident name/email/phone and `attachments` |
| `admin_activity` (view) | select | A (empty for others) | `listAdminActivity()` |
| `admin_activity_log` | select | A | No writes for anyone |
| `alert_deliveries` | select | A | |
| `push_tokens`, `environment_readings` | none | – | Reached only through the RPCs below |

### RPCs (`supabase.rpc(name, args)`)

| Function | Who | Purpose |
| --- | --- | --- |
| `environment_latest(p_lat?, p_lng?)` | G, R | `EnvironmentReading[]`: always all five categories, preferring readings within 25 km of the point. The point is never stored. `getEnvironment()` |
| `environment_glance()` | G, R | `EnvironmentGlance` for the home card (temperature, conditions, high/low, AQI, `activeAlerts`, 12-hour `hourly`, `updatedAt`, `stale`). `getEnvironmentGlance()` |
| `public_blight_reports_near(p_lat, p_lng, p_radius_km = 2)` | G, R | Active reports within the radius (0 < r ≤ 50), sorted by distance, with `distance_km` |
| `register_push_token(p_token, p_platform)` | G, R | Upsert. Linked to the caller, or unlinked for a guest. Returns `{ token, platform, lastRegisteredAt, linkedToProfile, created }`. `registerPushToken()` |
| `unregister_push_token(p_token)` | G, R | Idempotent delete. The token itself is the authority |
| `nearby_blight_reports(p_category, p_lat, p_lng)` | R | Possible duplicates: same category within 50 m in the last 30 days (Q-013). Returns `{ id, status, created_at }[]`. `findNearbyReports()` |
| `touch_last_seen()` | R | Throttled `last_seen_at` stamp (15 min) |
| `is_admin()`, `is_active_user()` | R | Facts about the caller |
| `admin_set_role(p_user_id, p_role)` | A | Returns the profile. Last-admin invariant. Logged |
| `admin_set_status(p_user_id, p_status, p_suspended_until?)` | A | Admins can't block themselves. `suspended_until` must be in the future and applies only to `suspended`. Logged |
| `admin_summary()` | A | `{ reports: { submitted, underReview, active }, inquiries: { new, open }, users: { residents, admins, suspendedOrBanned }, notifications: { sentLast30Days } }`. Upcoming events come from Sanity. `getAdminSummary()` |
| `admin_add_environment_reading(p_category, p_level, p_summary, p_value?, p_unit?, p_source?, p_observed_at?)` | A | Manual water and mosquito readings (Q-009). Logged |
| `export_blight_reports()`, `export_housing_inquiries()` | A | Call with `.csv()`. No reporter or contact columns (Q-007). Formula-like cells are prefixed with `'`. Logged as `data_exported` |

Functions not in this table can't be called by `anon`/`authenticated`. That includes `promote_admin_by_email` (SQL editor only) and the service-role helpers used by the Edge Functions. `supabase/tests/database/090_grants.test.sql` holds the exact allowlist.

### Storage

| Bucket | Path | Rules |
| --- | --- | --- |
| `blight-photos` (**public read**) | `{report_id}/{random}.jpg` (the app always sends JPEG; the bucket also accepts PNG and WebP) | ≤ 10 MB. Upload: the reporter, while the report is `submitted` and < 24 h old, ≤ 5 objects. API list/read: the reporter and admins (public URLs work for anyone). Delete: admins. The app re-encodes every photo to JPEG (≤ 1600 px wide) before upload, which strips EXIF/GPS |
| `inquiry-attachments` (**private**) | `{auth.uid()}/{inquiry_id}/{file}.pdf\|jpg\|jpeg\|png\|heic` | ≤ 10 MB, ≤ 5 per inquiry, upload within 24 h of the inquiry. Read: owner and admins, through short-lived `createSignedUrl` URLs |

### Error mapping (`toApiError` in `resident.ts`)

| Postgres / PostgREST code | `ApiError.status` | Typical cause |
| --- | --- | --- |
| `42501` | 403 | RLS or privilege denial, blocked account, "Admin only", protected profile column |
| `PGRST116`, `P0002` | 404 | `.single()` found no row; "User not found" |
| `23505` | 409 | Duplicate (e.g. a second reminder for the same event) |
| `22xxx`, `23xxx`, `P0001` | 400 | Validation: check constraint, bad argument, "At least one active admin must remain", "A report can have at most 5 photos" |
| anything else | 500 | |

The app also raises `401 Unauthorized` itself when an action needs a session and there is none, and `400 UploadError` when a Storage upload fails. `ApiError.name` is the database error code.

## 3. Edge Functions (`supabase/functions/`)

All three run with the service role, which the platform injects. Gateway JWT verification is off (`config.toml`), so **each function authenticates its caller itself**. Secrets are listed in `supabase/README.md` and `supabase/functions/.env.example`.

| Function | Caller | Auth | Does |
| --- | --- | --- | --- |
| `send-alert` | Sanity webhook on `alert` create/update | `sanity-webhook-signature` HMAC with `SANITY_WEBHOOK_SECRET`, else `401` | Claims the alert in `alert_deliveries`. Only the first delivery per `_id` pushes; later calls refresh title and `ends_at`. Drafts → `202` skipped. Picks recipients with `alert_recipient_tokens`, pushes when `PUSH_ENABLED=true`, deletes dead tokens, records the outcome and logs `notification_sent` |
| `send-reminders` | pg_cron `hhha-send-reminders`, `*/5 * * * *` | `x-cron-secret` = `CRON_SECRET`, else `401` | No-op unless `PUSH_ENABLED=true`. Claims due reminders atomically (`claim_due_event_reminders`). With `SANITY_PROJECT_ID` set, it checks the events in Sanity: a deleted event removes the reminder, a moved event reschedules it. Then it pushes |
| `sync-environment` | pg_cron `hhha-sync-environment`, `*/30 * * * *` | `x-cron-secret` | NWS (only with `NWS_USER_AGENT`) → `temperature` and `heat`. AirNow (only with `AIRNOW_API_KEY`) → `air_quality` (worst pollutant). Both run for `DISTRICT_CENTROID` (default `33.759,-84.425`). Upserts readings, then prunes anything older than 30 days |

The cron jobs call `invoke_edge_function(name)` (pg_net). It does nothing until the Vault secrets `project_url` and `cron_secret` exist.

### Sanity webhook → `send-alert`

| Setting | Value |
| --- | --- |
| URL | `https://<project-ref>.supabase.co/functions/v1/send-alert` |
| Dataset / trigger | `production`; Create and Update; drafts off |
| Filter | `_type == "alert"` |
| Projection (request body) | `{ _id, title, message, category, endsAt }`. `_id` ≤ 200 chars; `title` and `message` non-empty; `category` one of the four alert categories; `endsAt` an ISO date or null. Anything else → `400` |
| Method / secret | POST; the secret is also `SANITY_WEBHOOK_SECRET` |

Signature header: `sanity-webhook-signature: t=<unix ms>,v1=<base64url(HMAC-SHA256(secret, "<t>.<raw body>"))>`. The comparison is constant-time, and the timestamp must be within 24 h. Responses:
- First delivery: `200 { alertId, recipientCount, pushed, ok, removedTokens }`.
- Repeat delivery: `200 { alertId, duplicate: true }`.

### Recipients

| Alert category | Tokens |
| --- | --- |
| `emergency` | every registered token: guests and blocked accounts included (public safety, Q-005) |
| `health_warning` / `community_announcement` / `meeting_reminder` | tokens linked to a non-blocked profile with `notif_health_warnings` / `notif_community_announcements` / `notif_meeting_reminders` on |
| event reminder | the reminder owner's tokens, if the account isn't blocked |

## 4. Edge Functions ⇄ Expo Push Service

`POST https://exp.host/--/api/v2/push/send` in batches of ≤ 100, with `Authorization: Bearer $EXPO_ACCESS_TOKEN` only if enhanced push security is on. Tickets that report `DeviceNotRegistered` delete the token (`delete_push_tokens`). A failed batch is counted and the rest continue. Receipts are not polled yet.

Push payloads. The app routes on `data.type` (`routeForPush` in `src/lib/push.ts`):

| Kind | Title / body | `data` | Opens |
| --- | --- | --- | --- |
| Alert | alert `title` (≤ 65) / `message` (≤ 240); priority `high` for emergency | `{ type: 'notification', documentId: <alert _id>, category }` | `/alerts/[id]` |
| Event reminder | `Reminder: <event title>` / `Starts Sat, Oct 24, 6:00 PM` (America/New_York) | `{ type: 'event-reminder', eventDocumentId: <event _id> }` | `/events/[id]` |

## 5. Edge Functions ⇄ external data APIs
See `integrations.md`. NWS: `api.weather.gov/points/{lat},{lng}` → hourly forecast and the nearest station's latest observation, plus `alerts/active?point=` for heat alerts. AirNow: `airnowapi.org/aq/observation/latLong/current/`. The request URL is never logged, because the AirNow one contains the key.
