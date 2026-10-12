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

### Scripts

| Script | What it does |
| --- | --- |
| `npm run develop` (or `dev`) | Dev server with auto-reload and admin panel |
| `npm run build` | Build the admin panel and compile TypeScript |
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

## Configuration

- `config/database.ts`: database connection, driven entirely by `DATABASE_*` env vars (defaults to Postgres and the `strapi` schema).
- `.env.example`: every variable, plus commented placeholders for planned Supabase Auth (JWT verification) and Supabase Storage (S3 uploads) integration.
- `.env` is gitignored. Never commit real secrets.
