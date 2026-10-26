# Historic Hunter Hills Neighborhood Association App

A mobile app (iOS + Android) for Historic Hunter Hills and the surrounding Atlanta District 3 neighborhoods. It covers housing resources, blight reporting, environmental data, the community calendar, the resource library, push alerts, and an admin dashboard for HHHNA staff.

Prometheus Team No. 6305: Exahel Castaneda, Jeremiah Ochieng, Mark Volovoi, Lawson Crutcher. Client: Maya Teague (HHHNA).

| Part | Tech | Where |
| --- | --- | --- |
| Mobile app | Expo SDK 57, React Native, TypeScript, Expo Router | repo root (`src/`) |
| Content + staff admin UI | Sanity (Content Lake + Sanity Studio) | [`studio/`](studio/), project `nxvenp1m` |
| Auth, resident data, files, push and data sync | Supabase (Auth, Postgres + RLS, Storage, Edge Functions) | [`supabase/`](supabase/README.md), hosted |

## Quick start

```sh
nvm use                      # Node 22 LTS
npm install
npm run ios:sim              # Release build on the iOS simulator, no keys needed (demo mode)
```

On your own iPhone, without EAS or Expo Go:

```sh
cp .env.example .env         # set APPLE_TEAM_ID (and the Sanity/Supabase values when you have them)
npm run ios:device           # plug the phone in (or pair over Wi-Fi), pick it from the list
```

With no `EXPO_PUBLIC_*` values the app runs in **demo mode**: sample content, and sign-in simulated on the device. Choose "Volunteer / Staff" on Sign in to see the admin tools. To use real data, set the Sanity values (`EXPO_PUBLIC_SANITY_PROJECT_ID`, `EXPO_PUBLIC_SANITY_DATASET`) and the Supabase values (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) for the hosted dev projects.

Staff content is edited in the hosted Studio at **https://historic-hunter-hills.sanity.studio** (sign in with a Sanity account that's a member of project `nxvenp1m`), or locally:

```sh
cd studio && npm install && npm run dev   # http://localhost:3333
```

The database schema, RLS policies and Edge Functions are in `supabase/`. See [`supabase/README.md`](supabase/README.md).

Run `npm run check` (typecheck, lint, tests) to verify changes. The full guide, including the Studio and Supabase tests and deploys, is in [`docs/development.md`](docs/development.md).

## Documentation
- [`docs/`](docs/README.md): specifications (product, architecture, data model, API, security, UI, decisions)
- [`AGENTS.md`](AGENTS.md): instructions for AI coding agents
- [`docs/tasks/`](docs/tasks/): implementation task briefs and plans
