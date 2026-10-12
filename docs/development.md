# Development Guide

## Prerequisites
- **Node 22 LTS** (`.nvmrc`; run `nvm use`). Strapi 5 warns on non-LTS Node.
- npm (the repo uses `package-lock.json`, so don't use yarn or pnpm)
- Xcode (iOS simulator) and/or Android Studio (emulator)
- Docker Desktop (local Postgres for Strapi), **or** access to the team's Supabase dev project
- An Apple Developer account for installing on a physical iPhone (EAS is optional; it's only needed for store builds)

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
| Strapi (dev) | `cd backend && npm run develop` | Auto-reloads. Changing a content-type schema restarts the server and migrates the DB. `npm run seed` loads demo content |
| App on the iOS simulator | `npm run ios:sim` | Release build: the JS is bundled in, so no Metro is needed |
| App on your iPhone | `npm run ios:device` | Release build, signed with your team, installed over cable or Wi-Fi. See below |
| App with fast refresh | `npm run ios:dev`, then `npm start` | Debug build that loads JS from Metro |
| Android | `npm run android:device` / `npm run android:dev` | Same idea; needs Android Studio |
| Regenerate native projects | `npm run prebuild` | After changing `app.json`/plugins (D-008) |

**Demo mode.** Without `EXPO_PUBLIC_API_URL` the app uses bundled sample data. Without the Supabase vars, sign-in is simulated on the device. Pick **Volunteer / Staff** on Sign in to see the admin tools (D-016).

### Installing on your own iPhone (no EAS, no Expo Go)
1. Put your Team ID in `.env` as `APPLE_TEAM_ID=XXXXXXXXXX`. Find it at developer.apple.com → Account → Membership details.
2. Sign Xcode in to that Apple account (Xcode → Settings → Accounts). The script lets Xcode create the App ID and a provisioning profile with push notifications (`-allowProvisioningUpdates`). The default wildcard team profile can't sign push, and fails with "does not support the Push Notifications capability".
3. On the iPhone, enable **Settings → Privacy & Security → Developer Mode** and restart. Connect by cable the first time; Wi-Fi works after that.
4. Run `npm run ios:device` (`scripts/ios-device.sh`). It regenerates `ios/` if needed, installs pods, builds Release, then installs and launches the app on the first connected iPhone. Pass a name or ID to pick a phone: `npm run ios:device -- "Mark's iPhone"`. The first build takes a few minutes; later builds are incremental.
5. If iOS says "Untrusted Developer", go to Settings → General → VPN & Device Management and trust your certificate.

To use a backend running on your Mac, set `EXPO_PUBLIC_API_URL` to the Mac's LAN IP (e.g. `http://192.168.1.20:1337`), not `localhost`, and rebuild.

> **`pod install` fails with `ld: tapi error … unknown architecture arm64e.x1`?** Your Command Line Tools ship a newer macOS SDK than Xcode's linker understands. Run pods against Xcode's SDK: `cd ios && SDKROOT=$(xcrun --sdk macosx --show-sdk-path) pod install`, then rerun the build. Updating Xcode also fixes it.

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
| `npm test` | Jest + supertest. Compiles to `dist/` once, then boots Strapi per test file on a throwaway SQLite file with a fake Supabase JWKS. No Docker, network or secrets; `backend/.env` is ignored |
| `npm run seed` | Idempotent demo content for a dev DB (refuses when `NODE_ENV=production`) |
| `npm run promote-admin -- <email>` | Promote a signed-in-once user to admin (Q-001) |

**CI** (`.github/workflows/ci.yml`) runs the app checks and the backend build and tests on every push to `main` and on every PR.

Backend notes:
- Set `SUPABASE_URL` in `backend/.env` to the dev project so Strapi accepts the app's tokens. Use asymmetric (ES256) JWT signing keys in the Supabase project; `SUPABASE_JWT_SECRET` is only for legacy HS256 projects.
- Set the Supabase Auth minimum password length to 8 (dashboard → Authentication) to match the app's rule.
- External calls are off by default: `PUSH_ENABLED`, `ENVIRONMENT_SYNC_ENABLED` and `AIRNOW_API_KEY` turn on Expo push, NWS and AirNow. With them off, alerts are stored and recipients counted, and the environment endpoints serve whatever readings are in the DB (`npm run seed` adds demo readings; they go stale after 3 hours by design, so re-run the seed or enable the sync).
- `better-sqlite3` (tests only) has prebuilt binaries for Node 22; on Node 23 it may need to compile and can fail. Use `nvm use`.
- Test files live in `backend/tests/*.test.js`. `tests/helpers/context.js` gives each file `makeUser({ role, status })` (a profile plus a signed token), `as(user).get(...)`, and content factories.

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
