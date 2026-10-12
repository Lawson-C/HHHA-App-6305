# Historic Hunter Hills — Strapi backend

Headless CMS and REST API for the Historic Hunter Hills Neighborhood Association app.

Architecture: Expo app (repo root) → **Strapi 5** (this folder) → **Supabase** (Postgres, Auth, Storage).
Strapi stores its data in Postgres, in a dedicated `strapi` schema so its tables stay out of Supabase's `public` schema.

## Prerequisites

- Node.js 20–24 LTS (22 recommended; Strapi supports `>=20 <=26` but warns on non-LTS versions such as 23)
- npm
- Docker (for the local Postgres), or a Supabase project

## Local setup

```sh
cd backend
cp .env.example .env          # then replace every "tobemodified" secret (see below)
docker compose up -d          # Postgres 16 on localhost:5432, db/user/password "strapi"
npm install
npm run develop
```

Open http://localhost:1337/admin and create the first admin user.

Generate each secret with:

```sh
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
```

`APP_KEYS` takes at least two of these, comma separated.

On first start of an empty volume, `docker/postgres-init/01-create-strapi-schema.sql` creates the `strapi` schema (Strapi does not create it itself). To reset the local DB: `docker compose down -v`.

Then set `SUPABASE_URL` in `.env` (the team's dev Supabase project) so Strapi can verify app tokens, and optionally fill the dev database with demo content:

```sh
npm run seed                  # idempotent demo content (Figma copy); refuses when NODE_ENV=production
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run develop` (or `dev`) | Dev server with auto-reload and admin panel |
| `npm run build` | Build the admin panel and compile TypeScript |
| `npm test` | Jest + supertest suite (throwaway SQLite DB per test file, fake Supabase JWKS; no Docker or secrets) |
| `npm run seed` | Upserts demo content (alerts, events, housing, library, blight reports, environment readings). Dev only |
| `npm run promote-admin -- <email>` | Makes that user an admin (initial admin, Q-001). They must have signed in to the app once |
| `npm run start` | Production server (run `build` first) |
| `npm run console` | Interactive Strapi console |
| `npm run strapi -- <cmd>` | Any Strapi CLI command |
| `npm run upgrade` / `upgrade:dry` | Upgrade Strapi with `@strapi/upgrade` |
| `npm run deploy` | Strapi Cloud deploy (not used by this project) |

## Using Supabase Postgres instead

1. In the Supabase SQL editor, create the schema once:

   ```sql
   create schema if not exists strapi;
   ```

2. In the Supabase dashboard, open **Connect** and copy the **Session pooler** connection string (port 5432). Use the session pooler, not the transaction pooler (6543): Strapi needs session features such as `SET search_path`.

3. Set these in `.env`:

   ```sh
   DATABASE_CLIENT=postgres
   DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   DATABASE_SCHEMA=strapi
   DATABASE_SSL=true
   DATABASE_SSL_REJECT_UNAUTHORIZED=false   # or keep true and set DATABASE_SSL_CA to Supabase's CA cert
   ```

   `DATABASE_URL` overrides the individual `DATABASE_HOST`/`PORT`/`NAME`/`USERNAME`/`PASSWORD` values. Don't add `?sslmode=...` to the URL; it would override the SSL settings above.

You don't need `docker compose` in this mode.

## How the API is put together

- **Identity bridge** (`src/middlewares/supabase-auth.ts`, registered in `config/middlewares.ts`): on `/api/*` only, verifies the `Authorization: Bearer <Supabase access token>` (ES256/RS256 via the project's JWKS; HS256 only if `SUPABASE_JWT_SECRET` is set), then sets `ctx.state.profile`, creating the `profile` on first use. No header = anonymous. A bad token is always `401`.
- **Policies** (`src/policies/`): `global::is-authenticated` (signed in, not banned or suspended) and `global::is-admin` (same, plus `profile.role === 'admin'` from the database).
- **Routes** (`src/api/*/routes/*.ts`, built with `src/utils/routes.ts`): resident and admin routes use `auth: false` + one of those policies. Public collection reads (events, housing resources and listings, library, notifications) keep Strapi's permission check; `bootstrap()` grants the Public role `find`/`findOne` on them, and the `supabase` content-API auth strategy (`src/services/auth-strategy.ts`) gives signed-in callers the same Public permissions. Blight reports and the environment endpoints are public custom routes with their own serializers.
- **Document Service middleware** (`src/services/document-middleware.ts`): rules that also apply to the Strapi admin panel: the last-admin invariant, server-maintained blight `statusHistory`/`resolvedAt`, removing an event's reminders when it's deleted or unpublished, append-only `admin-activity-log`, audit entries for admin-panel edits, and push delivery for notifications created in the panel.
- **users-permissions** is locked down at boot: no self-registration and no Strapi login/register endpoints for app users.
- **Cron** (`config/cron-tasks.ts`): environment sync every 30 min (NWS when `ENVIRONMENT_SYNC_ENABLED=true`, AirNow when `AIRNOW_API_KEY` is set), event reminders every 5 min (only when `PUSH_ENABLED=true`), daily pruning of readings older than 30 days.
- **Uploads**: local `public/uploads` by default; Supabase Storage (S3 API) when all `SUPABASE_S3_*` vars are set. Blight photos are checked by magic bytes, extension and MIME, and re-encoded to drop EXIF/GPS metadata (HEIC photos are rejected for now because they can't be re-encoded).

### Tests

`npm test` compiles the app to `dist/` once (`tests/global-setup.js`), then each test file boots Strapi from `dist/` against its own temporary SQLite file (`config/env/test/`), with a local fake Supabase JWKS (`tests/helpers/supabase.js`). `backend/.env` is not read. Every endpoint has authorization tests (guest / resident / other resident / admin) following `docs/security.md`. A test-only route (`/api/__test/admin-only`) exercises `global::is-admin` directly.

On macOS with Node 23, `better-sqlite3` may fail to build; use Node 22 (`nvm use`).

### Making the first admin

```sh
npm run promote-admin -- maya@example.org
```

Equivalent SQL (Supabase SQL editor): `update strapi.profiles set role = 'admin' where lower(email) = 'maya@example.org';`. Only with the client's agreement (Q-001). After that, admins promote others with `PUT /api/admin/users/:documentId/role`.

## Configuration

- `config/database.ts`: database connection, driven entirely by `DATABASE_*` env vars (defaults to Postgres and the `strapi` schema).
- `config/supabase.ts`: Supabase Auth settings (`SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUDIENCE`).
- `config/hhha.ts`: District 3 bounding box and centroid, push and environment-sync flags.
- `config/plugins.ts`: upload limits and the optional Supabase S3 provider.
- `config/env/test/`: test-only database, server and logger overrides.
- `.env.example`: every variable with comments.
- `.env` is gitignored. Never commit real secrets.
