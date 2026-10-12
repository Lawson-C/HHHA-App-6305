# API / Interfaces

## 1. App ⇄ Supabase Auth

The app uses `@supabase/supabase-js` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It stores the session in `expo-sqlite/localStorage` (per the Expo SDK 57 Supabase guide) and refreshes tokens automatically while the app is in the foreground.

| Action | Call |
| --- | --- |
| Sign up | `supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } })` |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` |
| Sign out | `supabase.auth.signOut()` |
| Recovery | `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'historichunterhills://reset-password' })` |
| Token for Strapi | `session.access_token` (JWT, `sub` = user id) |

The app **never** uses Supabase for data (`supabase.from(...)`) or storage. Those go through Strapi.

## 2. App ⇄ Strapi REST API

Base URL: `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:1337`). All paths start with `/api`. JSON over HTTPS in every non-local environment.

### Conventions
- **Auth header:** `Authorization: Bearer <supabase access_token>` on every request when signed in. Public endpoints also work without it.
- **Response shape (Strapi 5):** `{ data, meta }`. Errors are `{ data: null, error: { status, name, message, details } }`. Strapi 5 responses are flat (no `attributes` wrapper), and records are addressed by **`documentId`**, not `id`.
- **Query params:** Strapi's standard `filters`, `sort`, `pagination[page|pageSize]`, `populate`, `fields`. Encode them with `qs`.
- **Dates:** ISO-8601 UTC strings.
- **Status codes:** `401` missing or invalid token, `403` authenticated but not allowed (or account suspended), `400` validation error (with `details.errors[]` per field), `404` not found or not visible to the caller.
- A typed client in `src/lib/api/` wraps `fetch`, attaches the token and normalizes errors. Screens never call `fetch` directly.

### Endpoints

Legend: **P** = public (guest OK), **R** = signed-in resident, **A** = admin. "own" = filtered to the caller server-side.

| Method & path | Access | Purpose |
| --- | --- | --- |
| `GET /api/me` | R | Return (and lazily create) the caller's profile. Shape below (`documentId`, no numeric `id`) |
| `PUT /api/me` | R | Update `fullName`, `phone`, `notificationPreferences` (partial), `neighborhood`, `textSize`, `language`. Other keys (`role`, `status`, `email`, `supabaseUserId`, …) are silently ignored |
| `POST /api/push-tokens` | P/R | Register or refresh an Expo push token for this device |
| `DELETE /api/push-tokens/:token` | P/R | Unregister (on sign-out or permission revoked) |
| `GET /api/blight-reports` | P | Active reports. Params: `category`, `status` (comma-separated), `near=lat,lng&radiusKm` (default 2, max 50; results sorted by distance), `pagination[page|pageSize]`. **Never includes `reporter`**. Admins may also list `resolved`/`removed` and see `reporter` |
| `GET /api/blight-reports/:documentId` | P | One active report (the owner and admins can also open non-active ones) |
| `GET /api/blight-reports/mine` | R | Caller's own reports, all statuses |
| `POST /api/blight-reports` | R | Create (multipart: `data` JSON string + 1–5 `files.images`, JPEG/PNG/WebP ≤ 10 MB). Status is forced to `submitted` and reporter to the caller. `meta.possibleDuplicates` lists nearby same-category reports (Q-013) |
| `PUT /api/blight-reports/:documentId` | A | Edit, change status, resolve, remove. Writes `admin-activity-log` |
| `GET /api/events` | P | Published events. Filters: `startsAt` range (month), `eventType` |
| `GET /api/events/:documentId` | P | Event detail (+ `hasReminder` and `reminderId` when signed in) |
| `POST/PUT/DELETE /api/events[/:documentId]` | A | Manage events (also available in the Strapi admin panel) |
| `GET /api/event-reminders` | R (own) | Caller's reminders |
| `POST /api/event-reminders` | R | `{ event }` → `409` if a duplicate |
| `DELETE /api/event-reminders/:documentId` | R (own) | Remove reminder |
| `GET /api/housing-resources` | P | Filter by `category` |
| `GET /api/housing-resources/:documentId` | P | Detail |
| `POST/PUT/DELETE /api/housing-resources[/:documentId]` | A | Manage |
| `GET /api/housing-listings` | P | Open listings, newest first. Filter by `neighborhood` |
| `POST/PUT/DELETE /api/housing-listings[/:documentId]` | A | Manage |
| `GET /api/housing-inquiries` | R (own) / A (all) | Inquiries |
| `GET /api/housing-inquiries/:documentId` | R (own) / A | Detail. Attachment URLs are **signed, short-lived** |
| `POST /api/housing-inquiries` | R | Create (multipart with `files.attachments`) |
| `PUT /api/housing-inquiries/:documentId` | A | Update `status`, `adminNotes` |
| `GET /api/library-resources` | P | Filter by `category`, `resourceType` |
| `GET /api/library-resources/:documentId` | P | Detail |
| `POST/PUT/DELETE /api/library-resources[/:documentId]` | A | Manage |
| `GET /api/environment?lat=&lng=` | P | Latest reading per category near the point: `[{ category, value, unit, level, summary, observedAt, source, stale }]` |
| `GET /api/environment/glance` | P | Compact summary for the home card (shape below) |
| `POST /api/notifications` | A | `{ title, message, category, issuer?, body?, actionSteps?, affectedArea?, endsAt? }` → stores and sends. Returns the alert plus `recipientCount` |
| `GET /api/notifications` | P | Sent alerts, newest first (the Alerts screen). Filter by `category` |
| `GET /api/notifications/:documentId` | P | Alert detail (`body`, `actionSteps`, `affectedArea`, `issuer`) |
| `GET /api/admin/users?q=` | A | Search profiles |
| `PUT /api/admin/users/:documentId/role` | A | `{ role }`. Enforces the last-admin invariant |
| `PUT /api/admin/users/:documentId/status` | A | `{ status, suspendedUntil? }` |
| `GET /api/admin/summary` | A | Dashboard counts: `{ reports: { submitted, underReview, active }, inquiries: { new, open }, events: { upcoming }, users: { residents, admins, suspendedOrBanned }, notifications: { sentLast30Days } }` |
| `GET /api/admin/activity` | A | Paginated `admin-activity-log` |
| `GET /api/admin/export/:type.csv` | A | `type ∈ {blight-reports, housing-inquiries}`. Logged |

Content managed by staff can also be edited directly in the **Strapi admin panel** at `/admin`. The in-app admin screens and the admin panel must go through the same validation and logging (see `data-model.md`, admin-activity-log).

### Implemented request/response shapes

How routes are protected: resident and admin routes use `auth: false` plus the `global::is-authenticated` / `global::is-admin` policies. Public collection reads (events, housing resources, housing listings, library, notifications) use Strapi's permission check, so they accept Strapi's standard `filters`, `sort`, `pagination` and `fields` params, and the Public role's `find`/`findOne` are granted at boot. Blight reports and environment are custom public routes and accept only the params listed. Writes take a JSON body wrapped in `{ data: {...} }` (multipart: a `data` field holding a JSON string). Deletes return `204` with no body.

**`GET /api/me`, `PUT /api/me`** → `200`
```json
{ "data": {
  "documentId": "vl7bmx5oq1bjw3betk0rcb9y",
  "fullName": "Denise Carter",
  "email": "denise.carter@email.com",
  "phone": "+14045550142",
  "role": "resident",
  "status": "active",
  "suspendedUntil": null,
  "neighborhood": "english_avenue",
  "textSize": "default",
  "language": "en",
  "notificationPreferences": { "healthWarnings": true, "communityAnnouncements": true, "meetingReminders": false }
} }
```
`PUT` body: `{ "data": { "fullName"?, "phone"? (E.164 or null), "neighborhood"? (or null), "textSize"?, "language"?, "notificationPreferences"?: { any of the three booleans } } }`. Validation errors → `400` with `error.details.errors[] = { path: string[], message, name }`. `401` without a valid token; `403` with `error.message` `"Account suspended"` / `"Account banned"` and `error.details = { status, suspendedUntil }`.

**List envelope** (every list endpoint): `{ "data": [...], "meta": { "pagination": { "page", "pageSize", "pageCount", "total" } } }`. Default page size 25, max 100.

**`GET /api/events`** (default sort `startsAt:asc`; e.g. `?filters[startsAt][$gte]=…&filters[startsAt][$lt]=…&filters[eventType][$eq]=wellness&pagination[pageSize]=100`)
```json
{ "data": [ {
    "id": 6,
    "documentId": "s76qfy66bnpdrh9ak87dzpuk",
    "title": "Budgeting basics workshop",
    "description": "Learn a simple way to plan your monthly budget, …",
    "startsAt": "2026-10-24T22:00:00.000Z",
    "endsAt": "2026-10-24T23:30:00.000Z",
    "eventType": "financial_literacy",
    "locationName": "Hunter Hills Community Center",
    "address": "1100 Joseph E. Lowery Blvd NW, Atlanta, GA",
    "costLabel": "Free",
    "costNote": "Dinner and childcare provided",
    "neighborhood": "Hunter Hills",
    "createdAt": "…", "updatedAt": "…", "publishedAt": "…"
  } ],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 1, "total": 12 } } }
```
`GET /api/events/:documentId` returns the same object in `data`; for a signed-in caller it adds `"hasReminder": true|false, "reminderId": "<documentId>"|null`.

**Event reminders**: `POST /api/event-reminders` `{ "data": { "event": "<event documentId>" } }` → `201` `{ "data": { "documentId", "remindAt", "sentAt": null, "createdAt", "event": { "documentId", "title", "startsAt", "endsAt", "locationName" } } }`; duplicate → `409`; unknown or unpublished event → `404`. `remindAt` is 24 h before the start (1 h before if that has passed, else now; Q-004). `GET /api/event-reminders` → `{ "data": [same objects] }`. `DELETE` by someone other than the owner → `404`.

**Blight report object** (public audience):
```json
{ "id": 1042, "documentId": "nrvvld527a1frewu87pbmhhq", "category": "illegal_dumping",
  "description": "Tires and a couch dumped behind the corner store.", "latitude": 33.7625, "longitude": -84.4211,
  "address": "Joseph E. Boone Blvd NW near Lindsay St", "status": "submitted",
  "statusHistory": [ { "status": "submitted", "at": "2026-10-10T20:40:04.437Z" } ],
  "imageUrls": [ "/uploads/photo_abc123.png" ], "resolvedAt": null, "createdAt": "…", "updatedAt": "…" }
```
`imageUrls` are `/uploads/...` paths with the local provider (prefix with the API base URL) or absolute (possibly signed, short-lived) URLs with Supabase Storage. With `near`, each item also has `distanceKm`. The owner's view (`/mine`, `POST`, own detail) adds `keepNamePrivate` and `resolutionNote`; the admin view also adds `reporter: { documentId, fullName }`.

**`POST /api/blight-reports`** (multipart) → `201`
- form field `data`: `{"category":"illegal_dumping","description":"…","latitude":33.7601,"longitude":-84.4231,"address":"…","keepNamePrivate":true}` (description and address optional; coordinates must be inside `DISTRICT_BBOX`)
- files: 1–5 × `files.images` (JPEG, PNG or WebP; ≤ 10 MB; checked by content, not only extension). HEIC is rejected with a `400`, so the app should send JPEG. EXIF metadata (GPS) is stripped.
```json
{ "data": { "id": 7, "documentId": "…", "category": "illegal_dumping", "description": "…", "latitude": 33.7601, "longitude": -84.4231,
            "address": "…", "status": "submitted", "statusHistory": [ { "status": "submitted", "at": "…" } ],
            "imageUrls": [ "/uploads/photo_….png" ], "resolvedAt": null, "createdAt": "…", "updatedAt": "…",
            "keepNamePrivate": true, "resolutionNote": null },
  "meta": { "possibleDuplicates": [ "<documentId>", … ] } }
```
`PUT /api/blight-reports/:documentId` (admin): any of `category`, `status`, `description`, `address`, `latitude`, `longitude`, `resolutionNote`, `keepNamePrivate`. `statusHistory` and `resolvedAt` are maintained by the server; `status: "removed"` is the soft delete.

**Housing**: resources are returned flat with `highlights`, `eligibility` and `requiredMaterials` always arrays (`[]` when empty). Listings are flat with `imageUrl: string | null` instead of the `image` media object, newest first (`?filters[neighborhood][$eq]=vine_city`).

**Housing inquiries**: `POST /api/housing-inquiries` (multipart `data` = `{ "housingResource": "<documentId>", "message", "preferredContact": "email"|"phone" }` + up to 5 `files.attachments`: PDF, JPEG, PNG or HEIC ≤ 10 MB) → `201`
```json
{ "data": { "documentId": "…", "message": "…", "preferredContact": "phone", "status": "new",
            "housingResource": { "documentId": "…", "title": "Emergency rental assistance", "category": "rental_assistance" },
            "attachments": [ { "id": 3, "name": "lease.pdf", "mime": "application/pdf", "sizeKb": 1.2, "url": "/uploads/lease_….pdf" } ],
            "createdAt": "…", "updatedAt": "…" } }
```
Lists omit attachment `url`s (detail only). Admin responses add `adminNotes` and `profile: { documentId, fullName, email, phone }`. `400` if the resource doesn't accept inquiries or attachments.

**Notifications**: list/detail items are flat `{ id, documentId, title, message, category, issuer, body, actionSteps: string[], affectedArea, endsAt, sentAt, createdAt, updatedAt }`, only alerts that were sent (`sentAt` set), newest first. Filter the Alerts chips with `filters[category][$in][0]=community_announcement&filters[category][$in][1]=meeting_reminder`. `POST` (admin) → `201` with the same object plus `recipientCount`.

**Push tokens**: `POST /api/push-tokens` `{ "data": { "token": "ExponentPushToken[…]", "platform": "ios"|"android" } }` → `201` (new) or `200` (refreshed) `{ "data": { "token", "platform", "lastRegisteredAt", "linkedToProfile": boolean } }`. Signed in: the token is linked to the caller; guest: unlinked. `DELETE /api/push-tokens/:token` (URL-encode the token) → `204`, idempotent.

**`GET /api/environment?lat=&lng=`** → always all five categories:
```json
{ "data": [
  { "category": "temperature",   "value": 78,   "unit": "°F",  "level": "good",      "summary": "Partly cloudy",   "observedAt": "…", "source": "National Weather Service", "stale": false },
  { "category": "air_quality",   "value": 42,   "unit": "AQI", "level": "good",      "summary": "Good",            "observedAt": "…", "source": "AirNow (EPA)",             "stale": false },
  { "category": "water_quality", "value": null, "unit": null,  "level": "unhealthy", "summary": "Boil before use", "observedAt": "…", "source": "Atlanta Watershed Mgmt.",  "stale": false },
  { "category": "mosquito",      "value": null, "unit": null,  "level": "good",      "summary": "Low",             "observedAt": "…", "source": "Fulton County Health",     "stale": false },
  { "category": "heat",          "value": 88,   "unit": "°F",  "level": "moderate",  "summary": "Moderate",        "observedAt": "…", "source": "National Weather Service", "stale": false }
] }
```
A category with no data: `{ "category", "value": null, "unit": null, "level": "unknown", "summary": "Data not available", "observedAt": null, "source": null, "stale": true }`. `stale` = older than 3 h (temperature, heat, AQI) or 7 days (water, mosquito). `lat`/`lng` are optional and never stored.

**`GET /api/environment/glance`**
```json
{ "data": {
  "temperatureF": 78, "conditions": "Partly cloudy", "highF": 84, "lowF": 69,
  "airQuality": { "category": "air_quality", "value": 42, "unit": "AQI", "level": "good", "summary": "Good", "observedAt": "…", "source": "AirNow (EPA)", "stale": false },
  "activeAlerts": 3,
  "hourly": [ { "time": "2026-10-12T20:00:00.000Z", "temperatureF": 78 }, … ],
  "updatedAt": "2026-10-12T20:37:04.437Z",
  "stale": false
} }
```
`stale` refers to the temperature reading (values are returned as-is so the app can say "Last updated …"). `airQuality` is `null` when there is no AQI reading at all. `activeAlerts` counts sent alerts that haven't ended and either have a future `endsAt` or were sent in the last 24 hours.

**Admin**: `GET /api/admin/users?q=` → `{ data: [{ documentId, fullName, email, phone, role, status, suspendedUntil, neighborhood, lastSeenAt, createdAt }], meta }`. `PUT …/role` `{ data: { role } }` and `PUT …/status` `{ data: { status, suspendedUntil? } }` return the same user object; demoting, suspending, banning or deleting the last active admin → `400` `"At least one active admin must remain"`; admins can't suspend or ban themselves. `GET /api/admin/activity` → `{ data: [{ documentId, action, targetType, targetId, details, actor: { documentId, fullName } | null, createdAt }], meta }`. `GET /api/admin/export/blight-reports.csv` / `housing-inquiries.csv` → `text/csv` without reporter or contact details (Q-007 default), logged as `data_exported`.

## 3. Strapi ⇄ Supabase
- **Database:** `pg` connection string (session pooler, port 5432, SSL), `DATABASE_SCHEMA=strapi`.
- **JWT verification:** verify the Supabase access token against the project's JWKS (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, asymmetric signing keys). Fall back to the legacy HS256 `SUPABASE_JWT_SECRET` only if the project still uses it. Check `iss`, `aud = authenticated`, `exp`. Env vars (`backend/.env`): `SUPABASE_URL` (required), `SUPABASE_JWKS_URL` (optional override), `SUPABASE_JWT_SECRET` (optional, legacy HS256), `SUPABASE_JWT_AUDIENCE` (default `authenticated`).
- **Storage:** `@strapi/provider-upload-aws-s3` pointed at Supabase Storage's S3 endpoint (`<SUPABASE_URL>/storage/v1/s3`), with S3 access keys from the Supabase dashboard. Enabled only when all of `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_BUCKET`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` are set; `SUPABASE_S3_PRIVATE=true` switches to signed URLs. Otherwise the local provider (`backend/public/uploads`) is used.
- **Admin auth operations** (disable a user's sessions, look up auth email): Supabase Admin API with the **secret key**, server-side only.

## 4. Strapi ⇄ Expo Push Service
`POST https://exp.host/--/api/v2/push/send` in batches of ≤ 100 messages. Then check receipts. Remove tokens that return `DeviceNotRegistered`. Use an Expo access token if enhanced push security is enabled.

Implemented in `backend/src/services/push.ts`: sending happens only when `PUSH_ENABLED=true` (`EXPO_ACCESS_TOKEN` optional). Ticket-level `DeviceNotRegistered` errors remove the token. Polling receipts is not implemented yet. Recipients: emergency → every registered token (guests too, Q-005); other categories → tokens linked to a non-banned profile whose matching preference is on (`health_warning` → `healthWarnings`, `community_announcement` → `communityAnnouncements`, `meeting_reminder` → `meetingReminders`). Event reminders are pushed by a cron task every 5 minutes.

## 5. Strapi ⇄ external data APIs
See `integrations.md`. Implemented in `backend/src/services/environment-sync.ts` as a 30-minute cron task for the District 3 centroid (`DISTRICT_CENTROID`, default 33.759,-84.425): NWS (`ENVIRONMENT_SYNC_ENABLED=true`, `NWS_USER_AGENT`) writes `temperature` (with conditions, high/low and a 12-hour forecast for the home card) and `heat` (heat index plus active NWS heat alerts) readings; AirNow (whenever `AIRNOW_API_KEY` is set) writes `air_quality` using the worst pollutant. Water quality and mosquito readings are admin-entered for now (Q-009).
