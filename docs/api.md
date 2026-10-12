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
| `GET /api/me` | R | Return (and lazily create) the caller's profile: `{ id, fullName, email, phone, role, status, notificationPreferences }` |
| `PUT /api/me` | R | Update `fullName`, `phone`, `notificationPreferences`. Cannot change `role` or `status` |
| `POST /api/push-tokens` | P/R | Register or refresh an Expo push token for this device |
| `DELETE /api/push-tokens/:token` | P/R | Unregister (on sign-out or permission revoked) |
| `GET /api/blight-reports` | P | Active reports. Filters: `category`, `status`, `near=lat,lng&radiusKm`. **Never includes `reporter`** |
| `GET /api/blight-reports/:documentId` | P | One active report |
| `GET /api/blight-reports/mine` | R | Caller's own reports, all statuses |
| `POST /api/blight-reports` | R | Create (multipart: `data` JSON + `files.images`). Status is forced to `submitted` and reporter to the caller |
| `PUT /api/blight-reports/:documentId` | A | Edit, change status, resolve, remove. Writes `admin-activity-log` |
| `GET /api/events` | P | Published events. Filters: `startsAt` range (month), `eventType` |
| `GET /api/events/:documentId` | P | Event detail (+ `hasReminder` when signed in) |
| `POST/PUT/DELETE /api/events[/:documentId]` | A | Manage events (also available in the Strapi admin panel) |
| `GET /api/event-reminders` | R (own) | Caller's reminders |
| `POST /api/event-reminders` | R | `{ event }` → `409` if a duplicate |
| `DELETE /api/event-reminders/:documentId` | R (own) | Remove reminder |
| `GET /api/housing-resources` | P | Filter by `category` |
| `GET /api/housing-resources/:documentId` | P | Detail |
| `POST/PUT/DELETE /api/housing-resources[/:documentId]` | A | Manage |
| `GET /api/housing-inquiries` | R (own) / A (all) | Inquiries |
| `GET /api/housing-inquiries/:documentId` | R (own) / A | Detail. Attachment URLs are **signed, short-lived** |
| `POST /api/housing-inquiries` | R | Create (multipart with `files.attachments`) |
| `PUT /api/housing-inquiries/:documentId` | A | Update `status`, `adminNotes` |
| `GET /api/library-resources` | P | Filter by `category`, `resourceType` |
| `GET /api/library-resources/:documentId` | P | Detail |
| `POST/PUT/DELETE /api/library-resources[/:documentId]` | A | Manage |
| `GET /api/environment?lat=&lng=` | P | Latest reading per category near the point: `[{ category, value, unit, level, summary, observedAt, source, stale }]` |
| `GET /api/environment/glance` | P | Compact summary for the home card |
| `POST /api/notifications` | A | `{ title, message, category }` → stores and sends. Returns `recipientCount` |
| `GET /api/notifications` | P | Recent sent notifications (in-app inbox / history) |
| `GET /api/admin/users?q=` | A | Search profiles |
| `PUT /api/admin/users/:documentId/role` | A | `{ role }`. Enforces the last-admin invariant |
| `PUT /api/admin/users/:documentId/status` | A | `{ status, suspendedUntil? }` |
| `GET /api/admin/summary` | A | Dashboard counts (pending reports, new inquiries, …) |
| `GET /api/admin/activity` | A | Paginated `admin-activity-log` |
| `GET /api/admin/export/:type.csv` | A | `type ∈ {blight-reports, housing-inquiries}`. Logged |

Content managed by staff can also be edited directly in the **Strapi admin panel** at `/admin`. The in-app admin screens and the admin panel must go through the same validation and logging (see `data-model.md`, admin-activity-log).

## 3. Strapi ⇄ Supabase
- **Database:** `pg` connection string (session pooler, port 5432, SSL), `DATABASE_SCHEMA=strapi`.
- **JWT verification:** verify the Supabase access token against the project's JWKS (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, asymmetric signing keys). Fall back to the legacy HS256 `SUPABASE_JWT_SECRET` only if the project still uses it. Check `iss`, `aud = authenticated`, `exp`.
- **Storage:** `@strapi/provider-upload-aws-s3` pointed at Supabase Storage's S3 endpoint (`<SUPABASE_URL>/storage/v1/s3`), with S3 access keys from the Supabase dashboard.
- **Admin auth operations** (disable a user's sessions, look up auth email): Supabase Admin API with the **secret key**, server-side only.

## 4. Strapi ⇄ Expo Push Service
`POST https://exp.host/--/api/v2/push/send` in batches of ≤ 100 messages. Then check receipts. Remove tokens that return `DeviceNotRegistered`. Use an Expo access token if enhanced push security is enabled.

## 5. Strapi ⇄ external data APIs
See `integrations.md`.
