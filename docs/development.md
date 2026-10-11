# Development Guide

## Prerequisites
- **Node 22 LTS** (`.nvmrc`; run `nvm use`). Strapi 5 warns on non-LTS Node.
- npm (the repo uses `package-lock.json`, so don't use yarn or pnpm)
- Xcode (iOS simulator) and/or Android Studio (emulator)
- Docker Desktop (local Postgres for Strapi), **or** access to the team's Supabase dev project
- `eas-cli` for device builds (`npm i -g eas-cli`)

## First-time setup

```sh
git clone https://github.com/Lawson-C/HHHA-App-6305.git && cd HHHA-App-6305
nvm use
npm install                       # mobile app
cp .env.example .env              # fill in Supabase URL + publishable key (ask a teammate)

cd backend
npm install
cp .env.example .env              # generate secrets as described in backend/README.md
docker compose up -d              # local Postgres (or point DATABASE_URL at Supabase)
npm run develop                   # http://localhost:1337/admin → create your local admin
```

> If `npm install` fails with `EACCES` under `~/.npm`, fix the cache ownership with `sudo chown -R $(id -u):$(id -g) ~/.npm`.

## Running

| What | Command | Notes |
| --- | --- | --- |
| Strapi (dev) | `cd backend && npm run develop` | Auto-reloads. Changing a content-type schema restarts the server and migrates the DB |
| App: dev server | `npm start` | Press `i` / `a` for the simulator or emulator |
| App: native build on simulator | `npm run ios` / `npm run android` | Required after adding native modules or changing config plugins |
| App: device dev build | `eas build --profile development --platform ios\|android` | Profiles in `eas.json` |

On a physical device, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (e.g. `http://192.168.1.20:1337`), not `localhost`.

## Verifying changes

Mobile app (repo root):

| Command | Checks |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (`eslint-config-expo`) + Prettier rules |
| `npm run format` | Applies Prettier formatting |
| `npm test` | Jest (`jest-expo` preset) + React Native Testing Library |
| `npm run check` | **All of the above. Run before every commit or PR** |

Backend (`backend/`):

| Command | Checks |
| --- | --- |
| `npm run build` | TypeScript compile + admin panel build |
| *(planned, task 001)* `npm test` | Jest + supertest against a disposable Strapi instance |

**CI** (`.github/workflows/ci.yml`) runs the app checks and the backend build on every push to `main` and on every PR.

### Test conventions
- App tests: `*-test.ts(x)` files under `src/__tests__/` or next to the code. Test behavior through the user-visible UI (`screen.getByText`, `getByRole`), not implementation details.
- Mock network calls at the API-client boundary (`src/lib/api`), never inside components.
- Backend tests cover authorization rules first: one test per row of the access table in `docs/security.md` for every endpoint you touch.
- Manual end-to-end checks: walk through the relevant flow in `docs/design/user-flows.md` on iOS **and** Android.

## Adding dependencies
- App: **`npx expo install <pkg>`** (it picks SDK-57-compatible versions). Use `npx expo install <pkg> -- --dev` for dev deps, then double-check that the package ended up under `devDependencies`.
- After adding a package with a config plugin or native code, rebuild the native app (`npm run ios`/`android` or a new EAS dev build).
- Backend: `cd backend && npm install <pkg>`.

## Branching & PRs
- Branch from `main`: `feature/<short-name>`, `fix/<short-name>`.
- Keep PRs small. Link the user story or task in `docs/tasks/`. CI must be green.
