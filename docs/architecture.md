# Architecture

> Changed 2026-10-19: Strapi was replaced by **Sanity** (content) + **Supabase** (resident data and logic). See decision D-024.

## Overview

```
                         ┌──────────────────────────────┐
  Foundation staff ────▶ │  Sanity Studio  (studio/)    │  edit & publish content
                         └──────────────┬───────────────┘
                                        ▼
                         ┌──────────────────────────────┐   webhook on alert publish
                         │  Sanity Content Lake         │ ───────────────────────────┐
                         │  public dataset "production" │                            │
                         └──────────────┬───────────────┘                            │
                                        │ GROQ over HTTPS (CDN, no token)            │
┌───────────────────────────┐           │                                            │
│ Mobile app (Expo / RN)    │ ◀─────────┘                                            ▼
│ repo root: src/           │                                  ┌──────────────────────────────────┐
│                           │ ── Auth, tables, RPCs, Storage ─▶ │  Supabase                        │
│ supabase-js + session JWT │      (Row Level Security)        │  • Auth (ES256 JWTs)             │
└───────────────────────────┘                                  │  • Postgres + RLS: profiles,     │
                                                               │    reports, inquiries, reminders,│
                                                               │    push tokens, admin log, env   │
                                                               │  • Storage: blight-photos,       │
                                                               │    inquiry-attachments           │
                                                               │  • Edge Functions: send-alert,   │
                                                               │    send-reminders,               │
                                                               │    sync-environment              │
                                                               └───────┬──────────────┬───────────┘
                                                                       │              │
                                                     Expo Push Service ◀┘              └▶ NWS · EPA AirNow
```

## Components and responsibilities

### Mobile app (repo root)
- **Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript (strict), Expo Router, React Compiler, TanStack Query.
- **Owns:** presentation, navigation, client-side validation, device capabilities (location, camera/photos, push token) and the Supabase session.
- **Reads content from Sanity** (`src/lib/sanity.ts`, `src/lib/api/content.ts`) with GROQ over the public CDN API. No token is involved.
- **Reads and writes resident data in Supabase** (`src/lib/api/resident.ts`) as the signed-in user. Every request is checked by Row Level Security, so the app can only ever see what the database allows that user to see.
- **Never** holds a secret: no Sanity write token and no Supabase secret key.
- **Demo mode** (D-016): without Sanity env vars, content comes from bundled sample data. Without Supabase env vars, sign-in and resident data are simulated on the device.
- **Builds** locally with Xcode/Gradle (`npm run ios:sim`, `ios:device`, `ios:dev`), or with EAS for store builds.

### Sanity (`studio/`)
- **Content Lake:** alerts, events, housing programs, housing listings, library items, and the `appCopy` singleton (editable app text). The schemas are in `studio/schemaTypes/`.
- **Studio:** the staff admin UI. It runs locally with `cd studio && npm run dev`, or hosted at https://historic-hunter-hills.sanity.studio (`npm run deploy`). It's standalone, not embedded in any web app.
- **Dataset `production` is public** (D-025). Never store anything private in Sanity.
- **Webhook:** publishing an `alert` calls the Supabase `send-alert` Edge Function, which sends the push notifications.

### Supabase (`supabase/`)
- **Auth:** email + password, with ES256-signed JWTs.
- **Postgres:** resident data. **RLS is the authorization layer** (D-004). Privileged operations (role changes, the push token registry, admin summaries) are `security definer` functions that check `is_admin()`. Business rules live in triggers, so they hold no matter which client writes: the last-admin invariant, the append-only activity log, blight status history, and forcing the report owner.
- **Storage:** `blight-photos` (public read, owner upload) and `inquiry-attachments` (private: owner and admins).
- **Edge Functions (Deno):**
  - `send-alert`: the Sanity webhook. It sends pushes, filtered by each resident's preferences.
  - `send-reminders`: cron. It sends event reminders.
  - `sync-environment`: cron. It pulls NWS and AirNow readings.
- **Migrations, tests (pgTAP) and function code** are all in `supabase/`. Tests run against the hosted dev project (D-026).

### External services
See `integrations.md`. They're called only from Edge Functions, so keys stay in Supabase function secrets.

## Key flows

1. **Sign up / sign in.** The app calls Supabase Auth. A database trigger creates the `profiles` row. The app reads its own profile, and RLS allows only that row.
2. **Browse content.** The app runs GROQ queries against the Sanity CDN, and TanStack Query caches the results.
3. **Submit a blight report.**
   1. The app inserts a `blight_reports` row. RLS forces `reporter_id` to the signed-in user and the status to `submitted`.
   2. The app uploads photos to `blight-photos/{report}/…` (no user id in public URLs).
   3. The public sees the report through `public_blight_reports`, which has no reporter columns.
4. **Staff publish an alert.** Staff publish it in the Studio. A Sanity webhook calls `send-alert`, which picks push tokens by category and preferences, sends them in batches through Expo Push, and records the delivery.
5. **Environmental dashboard.** `sync-environment` stores readings on a cron. The app calls `environment_latest()` / `environment_glance()`, which flag stale data.

## Repository layout

```
/                       Expo app (package.json, app.json, app.config.ts, eas.json)
├── src/app/            Expo Router routes: (tabs)/(home|events|housing|library), report/, admin/, …
├── src/components/     App components; ui/ = design-system primitives (Figma components)
├── src/constants/      theme.ts: Figma tokens
├── src/lib/            api/ (content.ts = Sanity, resident.ts = Supabase, demo data), auth/, env, …
├── src/__tests__/      Route-level tests; src/__integration__/ = contract tests vs hosted services
├── studio/             Sanity Studio (own package.json): schemaTypes/, structure.ts, scripts/seed.ts
├── supabase/           config.toml, migrations/, functions/, tests/ (pgTAP)
├── assets/             brand/, art/, maps/: exported from Figma
├── docs/               Specs (this folder)
└── ios/, android/      Generated by `expo prebuild`; gitignored (D-008)
```

## Environments

| Env | App | Content | Data |
| --- | --- | --- | --- |
| Demo | Any build without `EXPO_PUBLIC_*` values | Bundled sample content | Simulated on device |
| Dev (shared) | `.env` → hosted dev projects | Sanity `nxvenp1m` / `production` | Supabase `lxwkbstypsyiscjegvgp` |
| Production | EAS / store builds | Sanity (decide: separate dataset or project) | Separate Supabase project (to create) |
