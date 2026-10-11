# Historic Hunter Hills Neighborhood Association App

A mobile app (iOS + Android) for Historic Hunter Hills and the surrounding Atlanta District 3 neighborhoods. It covers housing resources, blight reporting, environmental data, the community calendar, the resource library, push alerts, and an admin dashboard for HHHNA staff.

Prometheus Team No. 6305: Exahel Castaneda, Jeremiah Ochieng, Mark Volovoi, Lawson Crutcher. Client: Maya Teague (HHHNA).

| Part | Tech | Where |
| --- | --- | --- |
| Mobile app | Expo SDK 57, React Native, TypeScript, Expo Router | repo root (`src/`) |
| Backend + CMS | Strapi 5 | [`backend/`](backend/README.md) |
| Database, auth, files | Supabase (Postgres, Auth, Storage) | hosted |

## Quick start

```sh
nvm use                      # Node 22 LTS
npm install
cp .env.example .env         # Supabase URL + publishable key, API URL
npm start                    # then press i (iOS) or a (Android)

# backend (separate terminal)
cd backend && npm install && cp .env.example .env
docker compose up -d && npm run develop    # http://localhost:1337/admin
```

To verify changes, run `npm run check` (typecheck, lint, tests). The full guide is in [`docs/development.md`](docs/development.md).

## Documentation
- [`docs/`](docs/README.md): specifications (product, architecture, data model, API, security, UI, decisions)
- [`AGENTS.md`](AGENTS.md): instructions for AI coding agents
- [`docs/tasks/`](docs/tasks/): implementation task briefs and plans
