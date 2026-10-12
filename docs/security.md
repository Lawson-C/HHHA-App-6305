# Security & Privacy

## Principles
1. **The server decides.** Every authorization rule is enforced in Strapi (policies, controllers, sanitization). Hiding UI in the app is a convenience, not a control.
2. **The client holds no secrets.** Anything prefixed with `EXPO_PUBLIC_` ships inside the app binary and is public.
3. **Least data.** Collect only what a feature needs. Never expose one user's data to another.
4. **Everything over HTTPS** outside local development.

## Authentication
- **Supabase Auth** handles identity: email + password, email confirmation, password recovery, token refresh. Passwords are hashed by Supabase and never stored or logged by us.
- The app keeps the session in `expo-sqlite/localStorage`. On sign-out it calls `supabase.auth.signOut()` and unregisters its push token.
- Password policy (configure in the Supabase dashboard): minimum 8 characters, with leaked-password protection if available on the plan.
- Supabase Auth's built-in rate limits cover sign-up, sign-in and recovery. Turn on CAPTCHA (hCaptcha/Turnstile) before public launch to block automated account creation.
- Recovery responses are identical whether or not the email exists (no account enumeration).
- Phone/SMS verification is **not** in the first release (cost and provider TBD, see Q-002). Phone is stored as profile data only.

## Identity bridge (app → Strapi)
- A global Strapi middleware reads `Authorization: Bearer <jwt>`. It verifies the signature (Supabase JWKS), `exp`, `iss` (`<SUPABASE_URL>/auth/v1`) and `aud` (`authenticated`). It then sets `ctx.state.profile` by looking up `profile.supabaseUserId = sub`, creating the profile if it doesn't exist.
- If there is no token, the request is anonymous. If the token is invalid or expired, return `401`. Never fall back to anonymous for a bad token.
- If `profile.status` is `banned`, or `suspended` and not yet expired, return `403` for all non-public routes.
- Strapi's own `users-permissions` login endpoints are **disabled** for app users (we don't issue Strapi JWTs). Its **Public** role is still used to grant read access to public collections.

Implementation (`backend/`):
- The middleware (`src/middlewares/supabase-auth.ts`) only runs on the REST prefix `/api`. Admin-panel paths (`/admin`, `/content-manager`, `/upload`, …) carry their own Strapi tokens and are left alone.
- **Algorithm pinning:** the token header decides the key. `ES256`/`RS256` → JWKS. `HS256` → `SUPABASE_JWT_SECRET`, and only if it is set (legacy; prefer asymmetric signing keys). Anything else, including `alg: none`, is rejected. `sub` must be a UUID. Clock tolerance is 5 s. If the JWKS can't be fetched, the answer is `401` (Q-I), never anonymous.
- Profiles are created on first use with `role = resident`, `status = active` (hard-coded). `fullName` comes from `user_metadata.full_name`, else the email's local part (Q-C); `phone` from metadata only if it is valid E.164. A real unique index on `supabaseUserId` plus in-process de-duplication prevents duplicate profiles under concurrent first requests. `lastSeenAt` is updated at most every 15 minutes, and the `email` mirror follows the token.
- **Suspension (Q-D):** `banned`, or `suspended` with no `suspendedUntil` (indefinite) or a future one → `403` on non-public routes. Once `suspendedUntil` has passed, access is allowed again; the status is not written back to `active`. Public reads still work for blocked users.
- **Route pattern:** resident and admin routes use `auth: false` + the `global::is-authenticated` / `global::is-admin` policies (401 with no profile; 403 with `"Account suspended"`, `"Account banned"` or `"Admin only"`). Public collection reads keep Strapi's permission check: `bootstrap()` grants the Public role `find`/`findOne` on events, housing resources, housing listings, library resources and notifications, and a `supabase` content-API auth strategy gives callers with a valid Supabase token the same **Public** permissions (Q-A), so signed-in users don't get `401` there. Nothing elevated ever comes from that strategy.
- **users-permissions lockdown:** at every boot, `allow_register` is set to false and every `plugin::users-permissions.auth.*` permission is removed from the Public role.
- **Ownership:** `reporter` (blight), `profile` (reminders, inquiries, push tokens) and `sentBy` (notifications) are always taken from `ctx.state.profile`. `PUT /api/me` silently ignores keys other than the editable ones (Q-G).
- **Push tokens:** registering or deleting a token needs only the token itself (it is the device's secret). Tokens are never returned in lists and there is no read endpoint.

## Authorization

| Resource | Guest | Resident | Admin |
| --- | --- | --- | --- |
| Public content (events, housing resources, library, environment, active blight reports) | read | read | read + write |
| Own profile | – | read/update (not role/status) | read/update any |
| Blight reports | read active, no reporter | create; read own (all statuses) | full, soft-delete only |
| Event reminders | – | own only | own only |
| Housing inquiries + attachments | – | create; read own | read all; update status/notes |
| Notifications | read history | read history | send |
| Roles / account status | – | – | change (last-admin invariant) |
| Admin activity log | – | – | read only (append-only) |
| Push tokens | register / unregister own device | register (linked to profile) / unregister | same as resident |

- `role` comes **only** from `profile.role` in our database, never from a client-provided field or the JWT's user metadata (users can edit their own `user_metadata`).
- Ownership fields (`reporter`, `profile`) are set from `ctx.state.profile` on the server. If a request body includes them, they are ignored.
- **Initial admin:** promoted with a one-off seed script or SQL run by the team, with the client's agreement. There is no self-service path to admin.
- **Strapi admin panel** users are staff accounts with Strapi RBAC roles (e.g. *Editor* for content, *Super Admin* for the team). Only invite people the client approves.

## Database exposure
- Strapi tables live in Postgres schema `strapi`. Leave `strapi` **out** of Supabase's "Exposed schemas" (Data API), so the publishable key cannot read app data through PostgREST.
- Enable RLS with no policies on anything created in `public`, so access is denied by default.
- Strapi connects with the database credentials from `backend/.env`. Those credentials never leave the server.

## File uploads
- Blight images: images only (validate MIME **and** extension), ≤ 10 MB, ≤ 5 per report. Strip EXIF metadata before public display, because GPS in EXIF could reveal more than the chosen pin. Stored in a public-read bucket.
  - Implemented: the file's magic bytes, extension and declared MIME type must agree (JPEG, PNG, WebP), and every photo is re-encoded with `sharp` (orientation applied, all metadata dropped) before upload. HEIC can't be re-encoded with the bundled `sharp`, so HEIC photos are rejected with a `400` until that is solved; the app should send JPEG.
- Housing attachments: pdf/jpeg/png/heic, ≤ 10 MB, ≤ 5. Stored in a **private** bucket and served only through signed URLs (≤ 15 min) to the owner or admins.
  - Implemented: content-sniffed like blight photos; URLs appear only in the detail response to the owner or an admin. Signed URLs need the Supabase S3 provider with `SUPABASE_S3_PRIVATE=true`. **Gap:** Strapi has one upload provider, so with a private bucket blight photo URLs are signed (expiring) too, and with the local provider (dev default) attachment files are reachable by anyone who knows their random URL. A separate private provider for attachments is a follow-up.

## Location privacy
- Ask for location permission only when it's needed, with a clear purpose string in `app.json`, and use "when in use" only.
- For the environmental dashboard, send coordinates to Strapi but **do not store** them.
- Blight report coordinates are public by design (they describe the blight, not the reporter). The reporter's identity is never public.

## Secrets
| Secret | Lives in |
| --- | --- |
| Supabase publishable key, Supabase URL, API URL | `.env` (`EXPO_PUBLIC_*`): public by design |
| Supabase secret / service-role key, DB password, JWT secret, S3 keys | `backend/.env` only, plus the hosting provider's secret store |
| AirNow API key, Expo access token, other third-party keys | `backend/.env` only |
| Strapi `APP_KEYS`, `ADMIN_JWT_SECRET`, etc. | `backend/.env` only |

`.env` files are gitignored. Commit only the `.env.example` files. If a secret is ever committed, **rotate it**. Deleting the commit is not enough.

## Logging & data retention
- Never log tokens, passwords, or the contents of attachments.
- `admin-activity-log` is append-only.
- Data export (CSV) is admin-only, logged, and excludes contact details unless the client confirms they are needed for grant reporting (Q-007). Implemented with that default; cells that start with `=`, `+`, `-`, `@` are prefixed with `'` to block CSV formula injection.
- `admin-activity-log` append-only is enforced by a Document Service middleware (updates and deletes throw, from the API and from the admin panel alike). Admin actions taken in the app are logged with the admin's profile as `actor`; edits in the Strapi admin panel are logged with `actor = null` and the panel user's id/email in `details`. The last-admin invariant is enforced in the same middleware, so the admin panel can't break it either.
- Account deletion: to be specified (Q-003). Expect to support it, because app-store policies require it.
