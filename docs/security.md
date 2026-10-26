# Security & Privacy

> Changed 2026-10-19: Strapi was removed (D-024). **Row Level Security in Supabase is now the authorization layer** (D-004).

## Principles
1. **The database decides.** The app talks to Supabase directly with the publishable key and the user's session. Every rule is enforced in Postgres: RLS policies, column grants, triggers and `security definer` functions. Hiding UI in the app is a convenience, not a control.
2. **Deny by default.** Default privileges for `anon`/`authenticated` are revoked in `public`. Every table has RLS on. Anything not explicitly granted is denied.
3. **The client holds no secrets.** Anything prefixed with `EXPO_PUBLIC_` ships inside the app binary and is public.
4. **Nothing private in Sanity.** The `production` dataset is public (D-025). Anyone can query it without a token.
5. **Least data.** Collect only what a feature needs. Never expose one user's data to another.
6. **Everything over HTTPS.** Sanity and Supabase are both HTTPS-only.

## Authentication
- **Supabase Auth** handles identity: email + password, email confirmation, password recovery, token refresh. Sessions are ES256-signed JWTs. Passwords are hashed by Supabase and never stored or logged by us.
- The app keeps the session in `expo-sqlite/localStorage` and refreshes tokens only while it is in the foreground. On sign-out it calls `supabase.auth.signOut()`, and the device's push token is re-registered as a guest token (no longer linked to the account).
- Minimum password length is 8 (`config.toml` locally; set the same in the hosted dashboard). Turn on leaked-password protection if the plan allows it.
- Supabase Auth's built-in rate limits cover sign-up, sign-in and recovery. Turn on CAPTCHA (hCaptcha/Turnstile) before public launch.
- No account enumeration: recovery always says "check your email", and a sign-up for an existing address is treated the same as "check your email".
- Phone/SMS verification is **not** in v1 (Q-002). Phone is stored as profile data only, and only if it is valid E.164.
- **Role never comes from the token.** `user_metadata` is user-editable, so `handle_new_user` ignores everything there except `full_name` and `phone`. Every new profile starts as `resident` / `active`. Role and status are read from `profiles` by `is_admin()` / `is_active_user()` (D-005).

## Authorization

| Resource | Guest | Resident | Admin |
| --- | --- | --- | --- |
| Public content in Sanity (alerts, events, housing programs and listings, library, app text) | read | read | read. Edit in the Studio (Sanity project members, not app roles) |
| Environment readings | read through `environment_latest` / `environment_glance` | same | same + add manual readings |
| Own profile | – | read; update `full_name`, `phone`, `neighborhood`, `text_size`, `language`, notification preferences (not role/status/email) | read/update any (role/status only through the RPCs) |
| Blight reports | read active, through `public_blight_reports` (no reporter, no `keep_name_private`, no `resolution_note`) | create; read own (all statuses); upload photos to own new report | read all; moderate (status, note, content); soft-delete only; delete photos |
| Event reminders | – | own only | own only |
| Housing inquiries + attachments | – | create; read own (without `admin_notes`); upload / read own attachments | read all (incl. notes, contact details, attachments); update status/notes |
| Alerts (push) | receive emergency | receive emergency + opted-in categories | send by publishing in the Studio; read `alert_deliveries` |
| Roles / account status | – | – | change through `admin_set_role` / `admin_set_status` (last-admin invariant) |
| Admin activity log | – | – | read only (append-only) |
| Dashboard summary, CSV exports | – | – | yes (exports logged) |
| Push tokens | register / unregister through the RPCs | same (linked to the account) | same |

"Resident" means an account that is not **blocked**. The rules for blocked accounts:
- `banned` is always blocked. `suspended` is blocked while `suspended_until` is null or in the future (Q-D).
- A blocked user can still read their own profile, so the app can explain the suspension. They can't update it, and every other resident policy denies them, so their reads come back empty and their writes fail with `42501` → 403.
- Guest-level access (public views and RPCs) keeps working for them.
- A blocked admin loses `is_admin()`.
- Existing sessions are not revoked when an admin bans someone (Q-018), but RLS denies them immediately.

How the rules are enforced:
- **Ownership is set by the database.** Owner columns default to `auth.uid()`: `reporter_id`, `user_id`. `before insert` triggers overwrite them, along with the server-owned fields (`status`, `status_history`, `resolved_at`, `admin_notes`, `sent_at`), for every client write. RLS `with check` then verifies the owner column again.
- **Column grants** limit what clients can insert and update (e.g. residents may update only the editable profile columns). `admin_notes` isn't even selectable on the base table.
- **Admin changes go through `security definer` RPCs** that check `is_admin()` and `set search_path = ''`: `admin_set_role`, `admin_set_status`, `admin_summary`, `admin_add_environment_reading`, `export_*`. The `profiles_guard` trigger rejects role/status changes made by a direct client `update`.
- **Last-admin invariant:** demoting, suspending, banning or deleting the last active admin fails (`assert_admin_remains`, serialized with an advisory lock). Admins can't suspend or ban themselves.
- **Append-only log:** triggers reject UPDATE, DELETE and TRUNCATE on `admin_activity_log` for every role. Entries are written only by `log_admin_action()`, from triggers, so role/status changes, report moderation and inquiry status changes are logged on every path, including the SQL editor (`actor_id` null outside a session).
- **Initial admin (Q-001):** the user signs up in the app, then the team runs `select public.promote_admin_by_email('…')` in the SQL editor. Clients can't call it. There is no self-service path to admin.
- **Sanity Studio access** is managed in sanity.io/manage (project members and roles). Only invite people the client approves. Studio users are not app accounts.

## Database exposure
- Only `public` and `graphql_public` are exposed through the Data API (`config.toml` `[api] schemas`). On the hosted project, keep any leftover `strapi` schema from the old backend **out** of "Exposed schemas".
- `supabase/migrations/20261019120700_function_grants.sql` revokes EXECUTE on every function in `public` from `public`, `anon` and `authenticated`, then grants back an explicit allowlist.
- `supabase/tests/database/090_grants.test.sql` checks RLS on every table, plus the exact table, column and function privileges of `anon` and `authenticated`. It fails whenever something new becomes reachable, so every new grant must be reviewed and added there deliberately.
- Views that must bypass base-table RLS (`public_blight_reports`, `admin_activity`, `admin_housing_inquiries`) use `security_barrier`, so caller filters can't run ahead of the view's own `WHERE`. The admin views are additionally gated by `is_admin()`.
- `push_tokens` and `environment_readings` have no client privileges at all. Push tokens are written only through `register_push_token` / `unregister_push_token`, are never readable by clients, and possession of the token is the authority to unregister it. Environment data is read only through the two read functions, so `raw` payloads never leave the database.
- The service role (full access) is used only inside the Edge Functions.

## File uploads
- **Blight photos** (bucket `blight-photos`, public read). The bucket enforces JPEG/PNG/WebP and ≤ 10 MB. RLS on `storage.objects` (`can_upload_blight_photo`) allows uploads only from the reporter, while the report is `submitted` and < 24 h old, up to 5 objects. A photo row can be attached only once the object exists.
  - The app **re-encodes every photo to JPEG** (`expo-image-manipulator`, ≤ 1600 px) before upload, which strips EXIF including GPS. That matters, because GPS in EXIF could reveal more than the chosen pin.
  - The object path is `{report_id}/{random}.jpg`. It **contains no user id**, because public URLs would otherwise link reports to (and between) reporters.
- **Housing attachments** (bucket `inquiry-attachments`, **private**). PDF/JPEG/PNG/HEIC, ≤ 10 MB, ≤ 5 per inquiry. The path is `{user_id}/{inquiry_id}/{file}`. Only the owner (within 24 h of the inquiry) can upload. Only the owner and admins can read, and only through short-lived signed URLs (`createSignedUrl`).

## Location privacy
- Ask for location permission only when it's needed, with a clear purpose string, and use "when in use" only. Home asks only when the resident taps "Use my location"; the report flow asks when a report is started.
- **Neighborhood detection happens on the device** (`src/lib/location.ts`, decision D-029): the coordinates are compared with the bundled City boundaries and are never sent anywhere. Only the neighborhood *name* is saved, and only to the signed-in resident's own profile when they haven't chosen one.
- `environment_latest(p_lat, p_lng)` uses the point to pick the nearest readings and **never stores it**. `sync-environment` fetches for the District 3 centroid, never a user's location.
- Blight report coordinates are public by design: they describe the blight, not the reporter. The reporter's identity is never public.

## Secrets

| Secret | Lives in |
| --- | --- |
| Supabase URL + publishable key, Sanity project id + dataset, Studio URL | `.env` (`EXPO_PUBLIC_*`): public by design |
| Supabase service-role / secret key | Injected into Edge Functions by the platform. Never in the app, never in a file in the repo |
| `SANITY_WEBHOOK_SECRET`, `CRON_SECRET`, `EXPO_ACCESS_TOKEN`, `AIRNOW_API_KEY`, optional `SANITY_READ_TOKEN` | Supabase **Edge Function secrets** (`npx supabase secrets set`). Locally in `supabase/functions/.env` (gitignored) |
| `cron_secret`, `project_url` | Supabase **Vault** (used by pg_cron) |
| Sanity write token | Not used by the app or functions. `npm run seed` in `studio/` uses your own CLI login (`--with-user-token`) |
| Database connection string (`SUPABASE_DB_URL`) | `supabase/.env.local` (gitignored), for `db push` / `test db` |
| Supabase access token (CLI) | Your machine, through `npx supabase login` |
| `CONTRACT_TEST_EMAIL` / `CONTRACT_TEST_PASSWORD` | `.env` (gitignored). A dev-project test account, not a secret of the service |

`.env` files are gitignored. Commit only the `.env.example` files. If a secret is ever committed, **rotate it**. Deleting the commit is not enough.

## Logging & data retention
- Never log tokens, passwords, push tokens, or the contents of attachments. `sync-environment` never logs request URLs, because the AirNow URL contains the key.
- `admin_activity_log` is append-only (see above).
- CSV exports (`export_blight_reports`, `export_housing_inquiries`) are admin-only, logged as `data_exported`, and exclude reporter and contact details (Q-007 default). Cells starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` to block formula injection.
- Environment readings older than 30 days are pruned.
- Account deletion (Q-003): the schema supports the default. Reports are anonymized (`reporter_id` set null), inquiries and reminders are deleted (cascade), devices fall back to guest, and log entries are kept. There is no in-app deletion flow yet. App-store policies require one.
