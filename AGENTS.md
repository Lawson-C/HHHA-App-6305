# AGENTS.md

Instructions for AI coding agents working in this repository. This file says **how to work**. The project specs in `docs/` say **what to build**.

## Project in one paragraph
This is a mobile app for the Historic Hunter Hills Neighborhood Association (Atlanta District 3). Features: accounts, blight reporting, community calendar, housing resources, push notifications, environmental dashboard, resource library, and an admin dashboard. The stack:
- **Expo SDK 57 / React Native** app at the repo root.
- **Sanity** (`studio/`) for staff-edited content: alerts, events, housing, library, app text. Staff edit it in Sanity Studio.
- **Supabase** (`supabase/`) for auth and resident data: Postgres with Row Level Security, Storage, and Edge Functions for push and environment sync.

There is no custom server (D-024).

## Read before you work
| When the task involves… | Read |
| --- | --- |
| Anything | `docs/README.md`, then `docs/decisions.md` (especially **Open questions**) |
| Feature behavior / scope | `docs/product.md`, `docs/design/user-flows.md` |
| Screens, navigation, components | `docs/design/ui-spec.md` and the Figma file it links (use the Figma MCP tools if available: `get_screenshot` / `get_design_context` on the frame) |
| Content types, tables, fields | `docs/data-model.md`, plus the source of truth: `studio/schemaTypes/` (content) and `supabase/migrations/` (resident data) |
| Queries, RPCs, Storage paths, push payloads | `docs/api.md`, `src/lib/api/` |
| Auth, roles, RLS, uploads, secrets, privacy | `docs/security.md` (**always**, for any data or access change), `supabase/README.md`, and the pgTAP tests in `supabase/tests/database/` |
| Edge Functions, cron, Sanity webhook | `supabase/README.md`, `supabase/functions/` |
| External APIs | `docs/integrations.md` |
| Running / testing / deploying | `docs/development.md` |
| A specific task | its brief in `docs/tasks/` |

The `.docx` files in `docs/` are historical source material. The Markdown specs supersede them.

### Framework versions have changed. Do not code from memory.
- **Expo:** read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ (and the guides it links to) before using any Expo/RN API. SDK 57 differs from older SDKs: e.g. `NativeTabs` from `expo-router/unstable-native-tabs`, Supabase session storage via `expo-sqlite/localStorage`, flat ESLint config.
- **Sanity:** this is Sanity Studio v6 (`studio/package.json`). Use https://www.sanity.io/docs and the installed **`sanity-best-practices`** skill (`.agents/skills/sanity-best-practices`) for schemas (`defineType`/`defineField`), GROQ, webhooks and deployment.
- **Supabase:** check https://supabase.com/docs for current key names (publishable/secret keys, JWKS signing keys), RLS, Storage policies, Edge Functions (Deno), pg_cron and the CLI.
- If the docs contradict a spec in `docs/`, stop and report the conflict. Don't silently pick one.

## Architectural rules (do not violate without an approved decision)
1. **Content is read-only from Sanity, through `src/lib/api/content.ts`** (GROQ over the public CDN, no token). The app never writes to Sanity. Staff edit content in the Studio.
2. **Resident data goes through `src/lib/api/resident.ts`** (and `admin.ts` for admin screens) with supabase-js as the signed-in user or a guest. Screens never call `supabase`, `sanityQuery` or `fetch` directly.
3. **RLS is THE authorization layer.** Hiding UI is never enough. Every new table needs, in the same migration:
   - `enable row level security` and `revoke all … from anon, authenticated`;
   - explicit, minimal grants (column lists for insert/update where possible) and policies;
   - ownership columns defaulted and forced to `auth.uid()` by trigger.

   Every new function needs `revoke all … from public, anon, authenticated` and an explicit grant. `security definer` functions must `set search_path = ''`. Add pgTAP tests in `supabase/tests/database/` (guest / resident / other resident / admin / blocked) and update the inventory in `090_grants.test.sql`.
4. The role and status come from `public.profiles`, and change only through the admin RPCs. Never take them from JWT user metadata or request bodies. Keep the last-admin invariant and the append-only `admin_activity_log` intact.
5. **Never put private data in Sanity.** The dataset is public (D-025). Anything about a person goes in Supabase.
6. **No secrets in the app.** Only these may be `EXPO_PUBLIC_*`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SANITY_PROJECT_ID`, `EXPO_PUBLIC_SANITY_DATASET`, `EXPO_PUBLIC_SANITY_STUDIO_URL`. The service-role key, the Sanity webhook secret, the cron secret and third-party keys live only in Supabase Edge Function secrets or Vault. Never commit `.env` files. Never print secret values in output or logs.
7. **Edge Functions authenticate their callers** (Sanity HMAC signature, `x-cron-secret`). Gateway JWT checks are off for them. External APIs are called only from Edge Functions, and their results are cached in the database.
8. **Migrations are new timestamped files** in `supabase/migrations/`. Never edit one that has already been applied. Soft-delete moderated records.
9. **Sanity schema changes** follow the deprecation pattern: add the new field, migrate the content, then mark the old field `deprecated` / `readOnly` / `hidden` before removing it, so published content and installed apps don't break. Field names and enum values must stay in sync with `src/lib/api/types.ts`, the GROQ projections in `content.ts`, `studio/schemaTypes/shared/options.ts` and `docs/data-model.md`, all in the same change.
10. Never hand-edit `ios/` or `android/`: they are generated and gitignored (D-008). Change `app.json` / `app.config.ts` / config plugins and rebuild.
11. App code layout:
    - Routes go in `src/app/`. Tab screens live under `(tabs)/`, with one Stack per tab.
    - Reusable UI goes in `src/components/` (design-system primitives in `src/components/ui/`).
    - Data access goes in `src/lib/api/`. Screens use the hooks in `queries.ts`.
    - Auth lives in `src/lib/auth/`. Editable app text goes through `useAppCopy()` (`src/lib/app-copy.ts`).
    - Theme tokens live only in `src/constants/theme.ts`. Colors and type come from the Figma variables, so use `Colors.*`, `Typography.*` and `<Text variant>`, never raw hex or font sizes.
    - Use the `@/` import alias.
12. **Demo mode** (D-016): every function in `src/lib/api/` has a real branch (Sanity or Supabase) and a demo branch (`mock-data.ts`, or on-device state). When you add a data function, add both, and keep the demo data shaped exactly like the real response.

## How to approach a task
1. **Read** the task brief and the relevant specs (table above). Investigate the existing code before proposing anything.
2. For anything nontrivial (multiple files, a new table, RPC, content type, auth, or data model changes), **write a plan first**: the files you'll touch, the approach, how each acceptance criterion will be verified, and any open questions. **Stop and wait for approval** if the task or the user asks for a plan. Otherwise proceed, but keep the plan in your summary.
3. Work in small, reviewable steps. Match the style of the surrounding code. Don't add dependencies the specs don't call for without saying why. Install app dependencies with `npx expo install`.
4. Keep docs in sync. If you change behavior, a query, a table, a field, or a decision, update the corresponding file in `docs/` in the same change.
5. Don't expand scope. Note follow-ups in your summary instead of building them.

## Verification (definition of done)
- `npm run check` passes at the repo root (typecheck + lint + Jest).
- If `studio/` changed: `cd studio && npm run typecheck && npx sanity schemas validate`.
- If `supabase/` changed:
  - `npx supabase test db --db-url "$SUPABASE_DB_URL"` (hosted dev; the URL is in gitignored `supabase/.env.local`), or locally `npx supabase start && npx supabase test db`.
  - For function changes, also `node --test --experimental-strip-types supabase/functions/tests/*_test.ts`.
- If the data layer or a schema changed: `npm run test:contract` (hosted Sanity + Supabase; needs `CONTRACT_TEST_EMAIL`/`PASSWORD` in `.env`).
- New behavior has tests. For data access, that means **pgTAP authorization tests** (guest / resident / other resident / admin / blocked) that follow the access table in `docs/security.md`.
- UI changes: describe how you checked them (simulator, platform) and walk through the matching flow in `docs/design/user-flows.md`. Handle the loading, empty and error states.
- Report honestly: what you ran, what passed, what you could not verify (e.g. no simulator, no Supabase credentials or access token), and why.

## When requirements are unclear
- Check `docs/decisions.md`. If the question is listed under **Open questions**, use the stated default only if one exists, and call it out in your summary.
- If it isn't listed and the choice affects data, security, UX or cost: **stop and ask**. Propose 2–3 options with a recommendation, and add the question to `docs/decisions.md`.
- For small, reversible implementation details, choose the conventional option and mention it.
- Never invent client requirements, API keys, external endpoints or brand assets. Use clearly marked placeholders instead.

## Commands cheat sheet
```sh
npm run ios:sim           # Release build on the iOS simulator (no Metro, no EAS)
npm run ios:device        # Release build on a USB/Wi-Fi iPhone (needs APPLE_TEAM_ID in .env)
npm run ios:dev           # Debug build + Metro (fast refresh)
npm start                 # Metro only (for an already-installed debug build)
npm run check             # typecheck + lint + test (app)
npm run test:contract     # app data layer vs hosted Sanity + Supabase
npm run format            # prettier

cd studio && npm run dev        # Sanity Studio on :3333
cd studio && npm run typecheck && npx sanity schemas validate
cd studio && npm run seed       # demo content into Sanity (idempotent)
cd studio && npm run deploy     # hosted Studio

npx supabase test db --db-url "$SUPABASE_DB_URL"           # pgTAP vs hosted dev
npx supabase db push --db-url "$SUPABASE_DB_URL"           # apply new migrations
node --test --experimental-strip-types supabase/functions/tests/*_test.ts
npx supabase functions deploy <name>                      # needs `npx supabase login`
```
