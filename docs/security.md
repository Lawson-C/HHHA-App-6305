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
- Housing attachments: pdf/jpeg/png/heic, ≤ 10 MB, ≤ 5. Stored in a **private** bucket and served only through signed URLs (≤ 15 min) to the owner or admins.

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
- Data export (CSV) is admin-only, logged, and excludes contact details unless the client confirms they are needed for grant reporting (Q-007).
- Account deletion: to be specified (Q-003). Expect to support it, because app-store policies require it.
