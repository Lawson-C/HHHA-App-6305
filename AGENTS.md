# AGENTS.md

Instructions for AI coding agents working in this repository. This file says **how to work**. The project specs in `docs/` say **what to build**.

## Project in one paragraph
This is a mobile app for the Historic Hunter Hills Neighborhood Association (Atlanta District 3). Features: accounts, blight reporting, community calendar, housing resources, push notifications, environmental dashboard, resource library, and an admin dashboard. The stack is **Expo SDK 57 / React Native** (repo root) → **Strapi 5** (`backend/`) → **Supabase** (Postgres + Auth + Storage).

## Read before you work
| When the task involves… | Read |
| --- | --- |
| Anything | `docs/README.md`, then `docs/decisions.md` (especially **Open questions**) |
| Feature behavior / scope | `docs/product.md`, `docs/design/user-flows.md` |
| Screens, navigation, components | `docs/design/ui-spec.md` |
| Content types, fields, relations | `docs/data-model.md` |
| Endpoints, request/response shapes | `docs/api.md` |
| Auth, roles, uploads, secrets, privacy | `docs/security.md` (**always**, for any endpoint or data change) |
| External APIs | `docs/integrations.md` |
| Running / testing | `docs/development.md` |
| A specific task | its brief in `docs/tasks/` |

The `.docx` files in `docs/` are historical source material. The Markdown specs supersede them.

### Framework versions have changed. Do not code from memory.
- **Expo:** read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ (and the guides it links to) before using any Expo/RN API. SDK 57 differs from older SDKs: e.g. `NativeTabs` from `expo-router/unstable-native-tabs`, Supabase session storage via `expo-sqlite/localStorage`, flat ESLint config.
- **Strapi:** this is **Strapi 5** (`backend/package.json`). Use https://docs.strapi.io/cms/ (v5): the Document Service API (`strapi.documents(...)`, `documentId`), not the v4 Entity Service or v4 response shapes.
- **Supabase:** check https://supabase.com/docs for current key names (publishable/secret keys, JWKS signing keys).
- If the docs contradict a spec in `docs/`, stop and report the conflict. Don't silently pick one.

## Architectural rules (do not violate without an approved decision)
1. The app gets **all data from Strapi** over REST. It uses Supabase **only for auth** (`supabase.auth.*`). No `supabase.from()` or `supabase.storage` in the app.
2. **Authorization is enforced in Strapi** (policies, controllers, sanitizers). Hiding UI in the app is never enough. Ownership fields (`reporter`, `profile`, `sentBy`) are set server-side from the authenticated profile.
3. The role comes from `profile.role` in the database. Never from JWT user metadata or request bodies.
4. **No secrets in the app.** Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_URL` may be `EXPO_PUBLIC_*`. Every other key belongs in `backend/.env`. Never commit `.env` files. Never print secret values in output or logs.
5. External APIs are called from Strapi only, and their results are cached.
6. Soft-delete moderated records. `admin-activity-log` is append-only.
7. Strapi content types are created as `backend/src/api/<name>/content-types/<name>/schema.json` (or with `npm run strapi generate`). Field names and enums must match `docs/data-model.md` exactly. If you need a new field, update `data-model.md` in the same change.
8. Don't hand-edit `ios/` (see D-008). Change `app.json` / config plugins instead.
9. App code layout: routes in `src/app/`, reusable UI in `src/components/`, API/auth clients in `src/lib/`, theme tokens only in `src/constants/theme.ts`. Use the `@/` import alias.

## How to approach a task
1. **Read** the task brief and the relevant specs (table above). Investigate the existing code before proposing anything.
2. For anything nontrivial (multiple files, a new endpoint or content type, auth, or data model changes), **write a plan first**: the files you'll touch, the approach, how each acceptance criterion will be verified, and any open questions. **Stop and wait for approval** if the task or the user asks for a plan. Otherwise proceed, but keep the plan in your summary.
3. Work in small, reviewable steps. Match the style of the surrounding code. Don't add dependencies the specs don't call for without saying why. Install app dependencies with `npx expo install`.
4. Keep docs in sync. If you change behavior, an endpoint, a field, or a decision, update the corresponding file in `docs/` in the same change.
5. Don't expand scope. Note follow-ups in your summary instead of building them.

## Verification (definition of done)
- `npm run check` passes at the repo root (typecheck + lint + Jest).
- `cd backend && npm run build` passes if `backend/` changed. Once the backend test harness exists, `npm test` there must pass too.
- New behavior has tests. For endpoints, include **authorization tests** (guest / resident / other resident / admin) that follow the access table in `docs/security.md`.
- UI changes: describe how you checked them (simulator, platform) and walk through the matching flow in `docs/design/user-flows.md`. Handle the loading, empty and error states.
- Report honestly: what you ran, what passed, what you could not verify (e.g. no simulator, no Supabase credentials), and why.

## When requirements are unclear
- Check `docs/decisions.md`. If the question is listed under **Open questions**, use the stated default only if one exists, and call it out in your summary.
- If it isn't listed and the choice affects data, security, UX or cost: **stop and ask**. Propose 2–3 options with a recommendation, and add the question to `docs/decisions.md`.
- For small, reversible implementation details, choose the conventional option and mention it.
- Never invent client requirements, API keys, external endpoints or brand assets. Use clearly marked placeholders instead.

## Commands cheat sheet
```sh
npm start                 # Expo dev server
npm run ios | android     # native build + run
npm run check             # typecheck + lint + test (app)
npm run format            # prettier
cd backend && npm run develop   # Strapi on :1337 (needs DB; see backend/README.md)
cd backend && npm run build
```
