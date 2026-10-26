# Development Guide

> Changed 2026-10-19: Strapi and `backend/` were removed (D-024). Content lives in Sanity (`studio/`), and resident data in Supabase (`supabase/`).

## Prerequisites
- **Node 22 LTS** (`.nvmrc`; run `nvm use`). The app, the Studio and the Edge Function unit tests (`--experimental-strip-types`) all use it.
- npm (the repo uses `package-lock.json`, so don't use yarn or pnpm). The app and `studio/` each have their own `package.json`.
- Xcode (iOS simulator) and/or Android Studio (emulator)
- An Apple Developer account for installing on a physical iPhone (EAS is optional; it's only needed for store builds)
- Access to the team's hosted dev projects (D-026): Sanity project `nxvenp1m` (ask to be invited at sanity.io/manage) and Supabase project `lxwkbstypsyiscjegvgp`
- Optional: Docker Desktop, only for a **local** Supabase stack (`npx supabase start`). The hosted dev project needs no Docker. The Supabase CLI is a devDependency, so use `npx supabase …`

## First-time setup

```sh
git clone https://github.com/Lawson-C/HHHA-App-6305.git && cd HHHA-App-6305
nvm use
npm install                       # app (+ the Supabase CLI)
cp .env.example .env              # see below

cd studio && npm install && cd .. # Sanity Studio
```

> If `npm install` fails with `EACCES` under `~/.npm`, fix the cache ownership with `sudo chown -R $(id -u):$(id -g) ~/.npm`.

**App `.env`.** The values are public by design (ask a teammate):

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev project (dashboard → Project Settings → API) |
| `EXPO_PUBLIC_SANITY_PROJECT_ID`, `EXPO_PUBLIC_SANITY_DATASET` | `nxvenp1m`, `production` |
| `EXPO_PUBLIC_SANITY_STUDIO_URL` | optional: the deployed Studio URL |
| `APPLE_TEAM_ID` | only for `npm run ios:device` |
| `CONTRACT_TEST_EMAIL`, `CONTRACT_TEST_PASSWORD` | a test account of your own for `npm run test:contract`. It is created on the first run |

Leave the Sanity or Supabase values empty to use **demo mode** for that half (see below).

**Studio.** `cd studio && npx sanity login` once. The Studio already points at `nxvenp1m` / `production` (`sanity.config.ts`, `sanity.cli.ts`).

**Supabase CLI (hosted dev).** For migrations, pgTAP tests and deploying functions:
1. Put the dev database's direct connection string in `supabase/.env.local` as `SUPABASE_DB_URL=…`. That file is gitignored; never commit the string.
2. To deploy functions or set secrets, log in with a Supabase access token: `npx supabase login`. Optionally `npx supabase link --project-ref lxwkbstypsyiscjegvgp`.

**Supabase locally (optional, Docker).** `npx supabase start`, then `npx supabase db reset` (migrations + `seed.sql`). `npx supabase status -o env` prints the local URL and keys. Demo residents can be loaded with `supabase/scripts/seed-demo.ts` (see `supabase/README.md`). To point the app at the local stack, use `http://<your LAN IP>:54321`.

## Running

| What | Command | Notes |
| --- | --- | --- |
| Sanity Studio (dev) | `cd studio && npm run dev` | http://localhost:3333. Edits the shared `production` dataset |
| Seed Sanity content | `cd studio && npm run seed` | Loads the demo content from `src/lib/api/mock-data.ts`. Idempotent: skips documents whose type + title already exist, and never overwrites staff edits |
| App on the iOS simulator | `npm run ios:sim` | Release build: the JS is bundled in, so no Metro is needed |
| App on your iPhone | `npm run ios:device` | Release build, signed with your team, installed over cable or Wi-Fi. See below |
| App with fast refresh | `npm run ios:dev`, then `npm start` | Debug build that loads JS from Metro |
| Android | `npm run android:device` / `npm run android:dev` | Same idea; needs Android Studio |
| Regenerate native projects | `npm run prebuild` | After changing `app.json`/plugins (D-008) |
| Edge Functions locally | `npx supabase functions serve --env-file supabase/functions/.env` | Needs the local stack. Copy `supabase/functions/.env.example` first |

`EXPO_PUBLIC_*` values are inlined at build time. After changing `.env`, rebuild the app (or restart Metro with `npx expo start --clear`).

**Demo mode.** Without the Sanity vars the app uses bundled sample content. Without the Supabase vars, sign-in and resident data are simulated on the device. Pick **Volunteer / Staff** on Sign in to see the admin tools (D-016).

### Installing on your own iPhone (no EAS, no Expo Go)
1. Put your Team ID in `.env` as `APPLE_TEAM_ID=XXXXXXXXXX`. Find it at developer.apple.com → Account → Membership details.
2. Sign Xcode in to that Apple account (Xcode → Settings → Accounts). The script lets Xcode create the App ID and a provisioning profile with push notifications (`-allowProvisioningUpdates`). The default wildcard team profile can't sign push, and fails with "does not support the Push Notifications capability".
3. On the iPhone, enable **Settings → Privacy & Security → Developer Mode** and restart. Connect by cable the first time; Wi-Fi works after that.
4. Run `npm run ios:device` (`scripts/ios-device.sh`). It regenerates `ios/` if needed, installs pods, builds Release, then installs and launches the app on the first connected iPhone. Pass a name or ID to pick a phone: `npm run ios:device -- "Mark's iPhone"`. The first build takes a few minutes; later builds are incremental.
5. If iOS says "Untrusted Developer", go to Settings → General → VPN & Device Management and trust your certificate.

The hosted Sanity and Supabase URLs work from the phone as they are. Only a **local** Supabase stack needs your Mac's LAN IP instead of `127.0.0.1`.

> **Build fails with "this SDK is not supported by the compiler … Please select a toolchain which matches the SDK"** (or `cannot find type '__ObjC::expo'`)? Xcode updated to a newer Swift than the one Expo's precompiled modules were built with. The repo now builds them from source (D-028). If you still see it, run `rm -rf ios && npm run ios:device` so the native project is regenerated with the current `app.json`.

> **`pod install` fails with `ld: tapi error … unknown architecture arm64e.x1`?** Your Command Line Tools ship a newer macOS SDK than Xcode's linker understands. Run pods against Xcode's SDK: `cd ios && SDKROOT=$(xcrun --sdk macosx --show-sdk-path) pod install`, then rerun the build. Updating Xcode also fixes it.

## Verifying changes

Mobile app (repo root):

| Command | Checks |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (`eslint-config-expo`) + Prettier rules |
| `npm run format` | Applies Prettier formatting |
| `npm test` | Jest (`jest-expo`) + React Native Testing Library: unit and screen-flow tests. No network |
| `npm run check` | **All of the above. Run before every commit or PR** |
| `npm run test:contract` | `src/__integration__/`: runs the real data layer against the hosted Sanity dataset and Supabase dev project, and checks every response against `src/lib/api/types.ts`. Needs the `EXPO_PUBLIC_*` values plus `CONTRACT_TEST_EMAIL`/`PASSWORD` in `.env`. Each run writes a reminder (removed again), an inquiry and a blight report with a photo |

Sanity Studio (`studio/`):

| Command | Checks |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npx sanity schemas validate` | Schema validation |
| `npm run build` | Studio build (CI runs it too) |

Supabase:

| Command | Checks |
| --- | --- |
| `npx supabase test db --db-url "$SUPABASE_DB_URL"` | pgTAP suite (`supabase/tests/database/*.test.sql`) against the hosted dev database. Each file is one transaction that is rolled back, so it leaves nothing behind. Load the URL first, e.g. `set -a; source supabase/.env.local; set +a` (bash/zsh) |
| `npx supabase start && npx supabase test db` | The same suite on a throwaway local database (Docker) |
| `node --test --experimental-strip-types supabase/functions/tests/*_test.ts` | Edge Function unit tests (`_shared/`: push batching, webhook signature, reminders, environment parsing). `deno test supabase/functions/tests/` also works |

**CI** (`.github/workflows/ci.yml`) runs on every push to `main` and on every PR, in three jobs:
- `mobile`: typecheck, lint, Jest.
- `studio`: typecheck, `sanity schemas validate`, build.
- `supabase`: the function unit tests, then a local `supabase db start` + `supabase test db` with a generated signing key.

Contract tests are not in CI, because they need the team's accounts.

### Test conventions
- App tests: `*-test.ts(x)` files under `src/__tests__/` or next to the code. Test behavior through the user-visible UI (`screen.getByText`, `getByRole`), not implementation details.
- Mock network calls at the data-layer boundary (`src/lib/api`), never inside components.
- **Authorization tests live in pgTAP.** Any table, policy, grant or RPC change needs tests in `supabase/tests/database/` for guest / resident / other resident / admin / blocked user, following the access table in `docs/security.md`. Also update the inventory in `090_grants.test.sql`.
- Changing what a data function returns? Update the contract test and `types.ts` together.
- Manual end-to-end checks: walk through the relevant flow in `docs/design/user-flows.md` on iOS **and** Android.

## Applying migrations to the hosted dev project
Migrations are new timestamped files in `supabase/migrations/`. Never edit one that has been applied.

```sh
npx supabase migration list --db-url "$SUPABASE_DB_URL"   # local vs remote history
npx supabase db push --db-url "$SUPABASE_DB_URL"          # apply new migrations
npx supabase test db --db-url "$SUPABASE_DB_URL"          # then run the suite
```

If the remote history still lists the deleted Strapi-era migration `20261019000000`, run `npx supabase migration repair --status reverted 20261019000000 --db-url "$SUPABASE_DB_URL"` first.

## Deploying

**Studio:** `cd studio && npm run deploy` (`sanity deploy`, free `*.sanity.studio` hosting). The first deploy asks for a hostname. Put the resulting URL in `EXPO_PUBLIC_SANITY_STUDIO_URL` if the app should link to it.

**Edge Functions.** These need `npx supabase login` (a Supabase access token) and `--project-ref lxwkbstypsyiscjegvgp`, unless the project is linked:

```sh
npx supabase secrets set --env-file supabase/functions/.env    # values: supabase/functions/.env.example
npx supabase functions deploy send-alert
npx supabase functions deploy send-reminders
npx supabase functions deploy sync-environment
```

`config.toml` sets `verify_jwt = false` for all three. Each one checks its own caller: the Sanity signature, or `x-cron-secret`.

**Cron.** The jobs exist after the migrations, but they do nothing until the Vault secrets are set (SQL editor):

```sql
select vault.create_secret('https://lxwkbstypsyiscjegvgp.supabase.co', 'project_url');
select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
```

**Push** is sent only when the function secret `PUSH_ENABLED=true`. Until then alerts are recorded but nothing is sent.

## Sanity webhook (alerts → push)
sanity.io/manage → project `nxvenp1m` → API → Webhooks → Create:

| Setting | Value |
| --- | --- |
| URL | `https://lxwkbstypsyiscjegvgp.supabase.co/functions/v1/send-alert` |
| Dataset | `production` |
| Trigger on | Create and Update. Drafts off |
| Filter | `_type == "alert"` |
| Projection | `{_id, title, message, category, endsAt}` |
| HTTP method | POST |
| Secret | a long random string, also set as the `SANITY_WEBHOOK_SECRET` function secret |

## First admin (Q-001)
Sign up in the app, then run `select public.promote_admin_by_email('you@example.org');` in the Supabase SQL editor. After that, admins manage roles in the app.

## Adding dependencies
- App: **`npx expo install <pkg>`** (it picks SDK-57-compatible versions). Use `npx expo install <pkg> -- --dev` for dev deps, then double-check that the package ended up under `devDependencies`.
- After adding a package with a config plugin or native code, rebuild the native app (`npm run ios:dev`/`android:dev` or a new EAS dev build).
- Studio: `cd studio && npm install <pkg>`.
- Edge Functions: import with `npm:` / `jsr:` specifiers. Keep the logic in `_shared/` pure, so it stays testable under Node.

## Branching & PRs
- Branch from `main`: `feature/<short-name>`, `fix/<short-name>`.
- Keep PRs small. Link the user story or task in `docs/tasks/`. CI must be green.
