# Architecture

## Overview

```
┌──────────────────────────────┐        HTTPS/JSON (REST)        ┌──────────────────────────────┐
│  Mobile app (Expo / RN)      │ ──────────────────────────────▶ │  Strapi 5 (backend + CMS)    │
│  repo root: src/             │   Authorization: Bearer <JWT>   │  backend/                    │
│                              │                                 │  • REST API  /api/*          │
│  • UI, navigation            │                                 │  • Admin panel /admin (staff)│
│  • Supabase Auth client  ────┼──┐                              │  • Business rules, policies  │
│  • Location, camera, push    │  │                              │  • Cron: external data sync  │
└──────────────────────────────┘  │                              └──────┬─────────────┬─────────┘
                                  │ sign up / in / refresh             │ SQL (pg)    │ S3 API
                                  ▼                                    ▼             ▼
                    ┌──────────────────────────────────────────────────────────────────────┐
                    │  Supabase                                                            │
                    │  • Auth (auth.users, JWT issuer)                                     │
                    │  • Postgres — Strapi's tables live in schema `strapi`               │
                    │  • Storage — buckets for blight images / housing attachments         │
                    └──────────────────────────────────────────────────────────────────────┘
                                                      ▲
   External APIs (called ONLY by Strapi, never by the app with secret keys):
   EPA AirNow · NWS / weather · 9mile.us · geocoding  ──┘ (see integrations.md)
   Expo Push Service ◀── Strapi sends push notifications
```

## Components and responsibilities

### Mobile app (repo root)
- **Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript (strict), Expo Router (file-based routes in `src/app/`), React Compiler enabled, typed routes.
- **Owns:** presentation, navigation, client-side validation, device capabilities (location, camera/photo library, push token registration), and the Supabase **auth session**.
- **Talks to:**
  - **Supabase Auth** directly, via `@supabase/supabase-js` with the *publishable* key, only for sign-up, sign-in, sign-out, password recovery and token refresh.
  - **Strapi** for all application data. Each request sends the Supabase access token as `Authorization: Bearer <token>`.
- **Never:** reads or writes Supabase tables or Storage directly, holds secret keys, or calls external APIs that need secrets.
- Built locally with Xcode/Gradle (`npm run ios:sim`, `ios:device`, `ios:dev`), or with EAS for store builds. Expo Go isn't supported: the app uses native modules that Expo Go doesn't include.
- **Demo mode** (D-016): without `EXPO_PUBLIC_*` env vars the app runs entirely on bundled sample data with simulated sign-in.

### Strapi backend (`backend/`)
- **Stack:** Strapi 5 (TypeScript), Node LTS, `pg` client.
- **Owns:**
  - The **domain data model** (content types, see `data-model.md`) and its schema, which Strapi manages and auto-migrates from `schema.json` files.
  - **Authorization:** every resident or admin rule is enforced in Strapi policies and controllers, never only in the app.
  - The **Strapi Admin Panel** (`/admin`): the "easy-to-use backend" Foundation staff use to manage content (events, housing resources, library, notifications, moderation). Staff accounts there are separate from app accounts.
  - **External data sync:** cron jobs fetch and cache environmental data.
  - **Push fan-out:** sends to the Expo Push Service, filtered by user preferences.
  - **File uploads** to Supabase Storage through the S3-compatible upload provider.
- **Identity bridge:** a global middleware verifies the Supabase JWT and resolves (or lazily creates) the matching `profile` record, which holds the app role (`resident` | `admin`) and status. See `security.md`.

### Supabase
- **Auth:** the identity provider. It stores credentials (hashed), handles email confirmation and recovery, and issues JWTs.
- **Postgres:** Strapi's database. Strapi tables go in schema **`strapi`**, which is *not* exposed through Supabase's Data API (PostgREST), so the publishable key cannot reach app data.
- **Storage:** blight images (public-read bucket) and housing inquiry attachments (private bucket, served through short-lived signed URLs from Strapi).

### External services
See `integrations.md`. All calls go through Strapi so keys stay server-side and responses can be cached.

## Key flows (summary; detailed sequences in Detailed Design v2)

1. **Sign up / sign in:** the app calls Supabase Auth and gets a session. The app then calls `GET /api/me` on Strapi with the token. Strapi verifies the JWT and upserts the `profile`, and the app reads the role from the response to decide which UI to show.
2. **Submit blight report:** the app gets location and photos, then sends a `POST` to Strapi (multipart, or upload first and then reference the files). Strapi validates the request, stores the files in Supabase Storage and writes `blight_report` with status `submitted`.
3. **Admin sends notification:** an admin creates it in the app's admin dashboard or the Strapi admin panel. Strapi stores the `notification`, selects push tokens of opted-in users (everyone for emergency) and sends them in batches to Expo Push.
4. **Environmental dashboard:** a Strapi cron job refreshes the `environmental_reading` cache from AirNow and weather every N minutes. The app sends `GET /api/environment?lat&lng`, and Strapi returns the latest reading for each category with its `observedAt`, so the app can flag stale data.

## Repository layout

```
/                       Expo app (package.json, app.json, app.config.ts, eas.json)
├── src/app/            Expo Router routes: (tabs)/(home|events|housing|library), report/, admin/, …
├── src/components/     App components; ui/ = design-system primitives (Figma components)
├── src/constants/      theme.ts: Figma tokens (color, type, spacing, radius, shadow)
├── src/lib/            api/ (client, queries, demo data), auth/, env, storage, format, labels
├── src/__tests__/      Route-level tests (unit tests sit next to code in __tests__/)
├── assets/             brand/ (logo, icons), art/ (neighborhood map art), maps/: exported from Figma
├── backend/            Strapi 5 project (own package.json, own node_modules)
├── docs/               Specs (this folder)
└── ios/, android/      Generated by `expo prebuild`; gitignored (D-008)
```

## Environments

| Env | App | Strapi | Database |
| --- | --- | --- | --- |
| Local | `npx expo start` (dev build or simulator) | `npm run develop` on :1337 | Docker Postgres (`backend/docker-compose.yml`) **or** the shared Supabase dev project |
| Staging / prod | EAS Build (`development`, `preview`, `production` profiles in `eas.json`) | Hosting to be decided (open question Q-006) | Supabase project(s) |
