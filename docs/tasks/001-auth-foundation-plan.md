# Task 001: Auth & Roles Foundation (agent-proposed implementation plan)

> **Status: proposal, awaiting team review. Nothing in this plan has been implemented.**
> A fresh agent produced this plan with no prior conversation context. It was given only `AGENTS.md` and the brief [`001-auth-foundation.md`](001-auth-foundation.md). It was told to read the specs, investigate the repo, check the versioned Expo/Strapi/Supabase docs, propose a plan, and **stop before implementing**. The plan is kept verbatim. Review notes are at the end.

---

## 1. Summary of my understanding

We are building the identity bridge end to end:

- **App → Supabase Auth.** Sign up, sign in, keep the session across restarts, sign out.
- **App → Strapi.** Every request carries `Authorization: Bearer <supabase access_token>`.
- **Strapi.** A global middleware checks the token (JWKS first, HS256 secret as a fallback). It then finds the caller's `profile` by `supabaseUserId = sub`, or creates it on first use, and puts it in `ctx.state.profile`. Two reusable policies, `global::is-authenticated` and `global::is-admin`, enforce access and reject suspended or banned accounts with 403. `GET /api/me` and `PUT /api/me` expose the caller's own profile. Only `fullName`, `phone` and `notificationPreferences` can be edited.
- **The role comes only from `profile.role` in the database** (AGENTS rule 3). The app reads it from `/api/me` and uses `isAdmin` to gate UI. Strapi enforces everything again on the server.
- **Supporting pieces.** A CLI script promotes the first admin (Q-001). A backend Jest + supertest harness tests all of the above, and CI runs it.

---

## 2. Findings from the repo

### State of the repo
- **Most of the repo is uncommitted.** `git status`: `backend/`, `docs/`, `.github/`, `eslint.config.js`, `metro.config.js`, `.env.example`, `src/__tests__/` and `test/` are untracked, and several root files are modified. **The tooling and backend scaffold should be committed (or put up as a PR) before this task branches**, otherwise the task diff will be unreadable.
- **The app is still the Expo template.** `src/app/_layout.tsx` renders `AppTabs` (`NativeTabs`) directly at the root. The only routes are `index.tsx` and `explore.tsx`. `src/lib/` does not exist. `@supabase/supabase-js` and `expo-sqlite` are **not installed**.
- **The backend is a bare Strapi 5.57.0 scaffold.** `src/api/` is empty, `src/index.ts` is empty, and there is no test setup. `config/api.ts` already sets `rest.strictParams` and `documents.strictParams/strictRelations`. `@strapi/plugin-users-permissions` is installed and configured with `jwtManagement: 'refresh'`.
- **Secrets are handled correctly.** `backend/.env` exists locally and is gitignored by `backend/.gitignore`. I did not read its contents. `backend/.env.example` already has commented placeholders for `SUPABASE_URL`, `SUPABASE_JWT_SECRET` and `SUPABASE_JWKS_URL`.
- **CI** (`.github/workflows/ci.yml`) has a `mobile` job (typecheck, lint, jest) and a `backend` job (`npm ci`, `npm run build`). There is no backend test step yet.

### Surprises and gotchas (these shape the design)

1. **Strapi's `unique: true` does not create a database constraint.** In `@strapi/database` (`schema/schema.js`), a unique index is created only when `attribute.column.unique` is set. The top-level `unique: true` is just an application-level check in the document service, and two concurrent requests can both pass it. So AC4 ("concurrent requests don't create duplicates") needs a real database constraint plus de-duplication in the process (§4, D2).

2. **Supabase tokens break Strapi's built-in content-API auth.**
   - When the bearer token is a Supabase JWT, the users-permissions strategy's `verify` throws and its `catch` returns `{ authenticated: false }`. It does **not** fall back to the Public role.
   - The api-token strategy also returns `false`.
   - Result: any core route that doesn't set `auth: false` (for example a future public `GET /api/events`) returns **401 for signed-in users**. `api.md` says the app sends the token "on every request when signed in", so this is a trap for the next task.
   - For this task, our custom routes use `auth: false` plus our own policies. I propose a small fix as an option (§4, D4 and Q-A).

3. **The admin panel sends its own `Bearer` tokens** to `/admin/*`, `/content-manager/*`, `/upload/*` and similar paths. A truly global middleware that returns 401 on any bad token would break the admin panel. The middleware must only act on the REST prefix (`/api`).

4. **Policy outcomes in Strapi 5.57.**
   - Returning `false` from a policy throws `PolicyError`, which is a `ForbiddenError` and maps to **403**.
   - Throwing `errors.UnauthorizedError` from a policy gives **401**.
   - `PolicyError` messages are visible to the client, so we can send `"Account suspended"`.

5. **Expo Router SDK 57.**
   - `Protected` has only a `guard` prop. `redirectTo` arrives in SDK 58, so we must not use it.
   - `NativeTabs` does **not** support `Protected`. It has `NativeTabs.Trigger hidden`, which remounts the navigator.
   - So route protection has to live in a **root `Stack`**, with the tabs moved into a `(tabs)` group.

6. **`jose@6` (latest) is ESM-only**, and the Strapi backend compiles to CommonJS and runs under Jest. Jest does not support `require(esm)`. `jose@5.10.x` ships a `require` (CJS) export. A copy of `jose@4` is already in `node_modules`, but only as a transitive dependency, so we shouldn't rely on it.

7. **Supabase docs advise against verifying HS256 locally** (they recommend `GET /auth/v1/user` instead), and they call HS256 "not recommended for production". The spec asks for an HS256 secret fallback. I'll keep it, flag it, and make it opt-in (see §8).

8. **The official Strapi 5 testing guide uses a runtime TypeScript loader** (`tests/ts-runtime.js`, `tests/strapi.js`) with in-memory SQLite (`better-sqlite3`). `backend/tsconfig.json` includes `./**/*.js`, so `tests/` must be added to `exclude` or the harness files get compiled into `dist/`.

9. **`backend/config/database.ts` sqlite branch** joins `DATABASE_FILENAME` onto a path, which breaks `:memory:`. A `config/env/test/database.ts` override avoids the problem.

10. **Unrelated things I noticed** (not in scope):
    - The iOS `bundleIdentifier` is `org.historichunerhills`. "hunter" is misspelled.
    - A 31 MB `.ipa` sits at the repo root. It is gitignored, so this is fine.
    - `expo-env.d.ts` is listed in `.gitignore` but appears to be tracked.

---

## 3. Implementation steps

### Step 0: Prerequisites (team)
- Commit or merge the current tooling and backend scaffold.
- Create branch `feature/auth-foundation`.
- Get the Supabase dev project values (URL, publishable key, signing-key mode). Set "Minimum password length = 8" in Supabase Auth. Decide on email confirmation (recommended: **off** in dev).

### A. Backend (`backend/`)

**A1. Dependencies**
- `npm install jose@^5.10.0`. Justification: JWKS caching and JWT verification. v5 because of CJS and Jest (finding 6).
- Dev dependencies: `jest@^30`, `supertest`, `@types/supertest`, `@types/jest`, `better-sqlite3`.

**A2. Config**
- `config/supabase.ts` (new). Reads:
  - `SUPABASE_URL` (required in non-test environments)
  - `SUPABASE_JWKS_URL` (default `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
  - `SUPABASE_JWT_SECRET` (optional; HS256 is enabled only when this is set)
  - `SUPABASE_JWT_AUDIENCE` (default `authenticated`)

  The issuer is derived as `${SUPABASE_URL}/auth/v1`. Code reads these with `strapi.config.get('supabase.*')`.
- `config/middlewares.ts`: add `'global::supabase-auth'` after `'strapi::body'`. That puts it after `strapi::errors` (so errors use the standard format) and after `strapi::cors` (so 401 responses still carry CORS headers).
- `config/env/test/database.ts` (new): `better-sqlite3`, `:memory:` (following the Strapi testing guide).
- `.env.example`: uncomment and document the Supabase auth variables. State that `SUPABASE_JWT_SECRET` is legacy and optional.
- `tsconfig.json`: add `tests/` to `exclude`.

**A3. Content types**
- `src/components/notification/preferences.json`: three booleans (`healthWarnings`, `communityAnnouncements`, `meetingReminders`), all `default: true`.
- `src/api/profile/content-types/profile/schema.json`:
  - `draftAndPublish: false`.
  - Fields exactly as in `data-model.md`.
  - `supabaseUserId`: `string`, `required`, `unique`, plus `"column": { "unique": true }` so Postgres gets a real unique index.
  - `fullName`: `minLength: 1`, `maxLength: 100`.
  - `email`: `email`, `private`.
  - `phone`: `string`, `private`.
  - `role`: enum, default `resident`.
  - `status`: enum, default `active`.
  - `suspendedUntil`: `datetime`.
  - `notificationPreferences`: component, `repeatable: false`.
  - `lastSeenAt`: `datetime`.
- **No core router, controller or service for profile.** Without them, `/api/profiles` doesn't exist, and nobody can accidentally grant it to the Public role. Only `src/api/profile/routes/01-me.ts` and `controllers/me.ts` are added (A6). The admin panel's Content Manager can still edit profiles (staff only).

**A4. Identity bridge**
- `src/utils/supabase-jwt.ts`: a pure verification module.
  - `createRemoteJWKSet(jwksUrl, { cacheMaxAge: 10 min })`. Supabase's edge caches for 10 minutes; jose refetches on an unknown `kid`.
  - Algorithm pinning, based on the token header:
    - `ES256` or `RS256` → JWKS.
    - `HS256` → secret, **only if one is configured**.
    - Anything else (including `none`) → reject.
  - Always checks `iss`, `aud` and `exp` (jose default clock tolerance, plus 5 s).
  - Requires `sub` to be a UUID.
  - Returns `{ sub, email, userMetadata }`.
- `src/services/profile-resolver.ts` (or `src/api/profile/services/profile-resolver.ts`): `findOrCreateProfile(claims)`.
  1. `strapi.documents('api::profile.profile').findFirst({ filters: { supabaseUserId: sub }, populate: ['notificationPreferences'] })`.
  2. If not found, create it with `role: 'resident'` and `status: 'active'`, which are **hard-coded and never come from claims**. Other fields:
     - `email` from `claims.email`, lower-cased.
     - `fullName` from `user_metadata.full_name`, falling back to the email's local part (see Q-C).
     - `phone` from `user_metadata.phone`, only if it is valid E.164.
     - `notificationPreferences` all `true`.
  3. **Concurrency** is handled two ways:
     - (a) An in-process `Map<sub, Promise<Profile>>` makes simultaneous requests share one creation.
     - (b) If a unique-constraint or validation error happens anyway (because of multiple instances), catch it and re-run `findFirst`.
  4. Throttled `lastSeenAt` update: write only if it is older than 15 minutes. Fire-and-forget; errors are logged but don't fail the request. **Email mirror sync:** if the JWT `email` differs from the stored one, update it too (keeps admin search correct). Rule 3 is respected: email and name are display data, never roles.
- `src/middlewares/supabase-auth.ts` (global middleware):
  - If the path doesn't start with `strapi.config.get('api.rest.prefix')` (`/api`), call `next()` untouched. This protects the admin panel.
  - No `Authorization` header → the request is anonymous: `next()`.
  - Header present but not exactly `Bearer <token>`, or verification fails → `throw new errors.UnauthorizedError('Invalid or expired token')`. Never fall back to anonymous (`security.md`).
  - Valid token → set `ctx.state.profile` and `ctx.state.supabaseClaims`.
  - Never log tokens. Log only `sub` at debug level.

**A5. Policies**
- `src/utils/account-status.ts`: `isBlocked(profile, now)`. True for `banned`, or for `suspended` when `suspendedUntil` is null or in the future (see Q-D).
- `src/policies/is-authenticated.ts`:
  - No `ctx.state.profile` → throw `UnauthorizedError` (401).
  - Blocked → throw `PolicyError('Account suspended' | 'Account banned', { status, suspendedUntil })` (403).
  - Otherwise `true`.
- `src/policies/is-admin.ts`: runs the same checks itself (it doesn't depend on policy order), then `role === 'admin'`, else `PolicyError('Admin only')` (403).

**A6. `/api/me`**
- `src/api/profile/routes/01-me.ts`:
  - `GET /me` → `api::profile.me.find`
  - `PUT /me` → `api::profile.me.update`
  - Both use `config: { auth: false, policies: ['global::is-authenticated'] }`. `auth: false` bypasses the users-permissions and api-token strategies (finding 2). Our middleware and policy are the real authentication.
- `src/api/profile/controllers/me.ts`:
  - `find` returns `{ data: toMe(profile) }`. `toMe` is an explicit allow-list serializer: `documentId, fullName, email, phone, role, status, suspendedUntil, notificationPreferences{3 bools}`. It deliberately does not use `sanitizeOutput`, which would strip the owner's own private `email`/`phone`.
  - `update`:
    - Reads `ctx.request.body.data`.
    - **Picks only** `fullName`, `phone` and `notificationPreferences`. Everything else (`role`, `status`, `supabaseUserId`, `email`, `suspendedUntil`, `id`, `documentId`) is silently ignored, as `security.md` requires.
    - Validates with yup from `@strapi/utils` (`validateYupSchema`): `fullName` trimmed 1–100; `phone` E.164 `^\+[1-9]\d{1,14}$` or `null`; preferences are a partial object of booleans with no unknown keys.
    - Bad input → 400 `ValidationError` with `details.errors[]`.
    - **Merges** the preferences into the existing component values (an update replaces the whole component), then calls `documents.update({ documentId, data, populate })` and returns `{ data: toMe(updated) }`.

**A7. Admin promotion script (Q-001 default)**
- `src/utils/promote-admin.ts`: `promoteAdmin(strapi, email)`. Testable on its own.
  - Lower-cases and trims the email, then finds profiles by `email` (`$eqi`).
  - 0 matches → error: "No profile for that email. The user must sign in to the app once first."
  - More than 1 match → error, list the `documentId`s.
  - Banned → refuse.
  - Already admin → no-op message.
  - Otherwise sets `role: 'admin'`.
  - It does not write to `admin-activity-log`, because that type doesn't exist yet. Noted as a follow-up.
- `scripts/promote-admin.js` with npm script `"promote-admin": "node scripts/promote-admin.js"`. Usage: `npm run promote-admin -- user@example.com`.
  - Uses `compileStrapi()` → `createStrapi(appContext).load()` (the Strapi TS docs' programmatic start), calls `promoteAdmin`, then `strapi.destroy()`.
  - Exit codes: 0 / 1.
  - Never prints secrets.
- Documented in `backend/README.md` together with the equivalent SQL (`update strapi.profiles set role='admin' where lower(email)=...`).

**A8. Lock down users-permissions** (recommended; `security.md` says its login endpoints are disabled)
- In `src/index.ts` `bootstrap()`, idempotently:
  - set the users-permissions advanced setting `allow_register = false`;
  - remove the Public role's `plugin::users-permissions.auth.*` permissions (`register`, `callback`, `connect`, `forgotPassword`, `resetPassword`, `emailConfirmation`, `sendEmailConfirmation`).
- This is small, but if the team prefers it can be its own follow-up (Q-E).

**A9. Optional (Q-A): Supabase content-API auth strategy**
- In `src/index.ts` `register()`: `strapi.get('auth').register('content-api', { name: 'supabase', authenticate, verify })`.
  - `authenticate`: if `ctx.state.profile` exists, return `{ authenticated: true, credentials: profile, ability }`, where `ability` is generated from the **Public** role's permissions. Admin powers still come only from our policies.
  - `verify`: mirrors the users-permissions scope check.
- This makes future public core routes work when the app sends a token. **Recommended**, but it expands scope slightly, so it needs a decision.

**A10. Backend test harness**
- `tests/ts-compiler-options.js`, `tests/ts-runtime.js` and `tests/strapi.js`, adapted from the Strapi 5 testing guide. `NODE_ENV=test`, in-memory SQLite, dummy app secrets, `STRAPI_DISABLE_CRON`, `PORT=0`.
- `tests/helpers/supabase.js`:
  - Generates an ES256 keypair with jose.
  - Starts a local `http` server on port 0 that serves `/auth/v1/.well-known/jwks.json`.
  - Sets `SUPABASE_URL=http://127.0.0.1:<port>` and `SUPABASE_JWT_SECRET=<test secret>` **before** `setupStrapi()`.
  - Exposes `signToken({ sub, email, metadata, exp, iss, aud, alg, key })`, plus helpers to create a profile with a given role and status directly through `strapi.documents`.
- **Test-only route** for AC7: registered in the harness before `start()` (the guide's harness registers `/api/hello` the same way). `GET /api/__test/admin-only` with `policies: ['global::is-admin']`. Not in production code (Q-B).
- `package.json`:
  - `"test": "jest --runInBand --forceExit --detectOpenHandles"`
  - Jest config: `testEnvironment: node`, ignore `.tmp`, `.cache`, `dist`.
  - `testMatch: ['<rootDir>/tests/**/*.test.{js,ts}']`. Write tests in JS, or in TS through the guide's runtime loader.
- Test files:
  - `tests/auth-middleware.test.js`
  - `tests/me.test.js`
  - `tests/policies.test.js`
  - `tests/promote-admin.test.js`
  - `tests/admin-panel-unaffected.test.js`
  - Coverage is in §5.

### B. App (repo root)

**B1. Dependencies**
- `npx expo install @supabase/supabase-js expo-sqlite`. This is per the Expo Supabase guide. `expo-sqlite` adds a config plugin to `app.json`.
- **This needs a native rebuild.** Because of D-008, regenerate `ios/` with `npx expo prebuild` rather than hand-editing.
- No other new runtime dependencies. Form validation is hand-written, which is enough for four fields.

**B2. `src/lib/supabase.ts`**
- Matches the Expo guide exactly:
  - `import 'expo-sqlite/localStorage/install'`
  - `createClient(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`
  - An `AppState` listener calls `startAutoRefresh`/`stopAutoRefresh`.
- A small `src/lib/env.ts` reads the three `EXPO_PUBLIC_*` variables with clear errors when they are missing. It is the only place `process.env.EXPO_PUBLIC_*` is read. Static `process.env.EXPO_PUBLIC_X` access is required for Expo inlining.

**B3. `src/lib/api/`**
- `client.ts`: `apiRequest<T>(path, { method, body, token? })`.
  - The token comes from an explicit argument, or else from `supabase.auth.getSession()`. The session is the single source of truth, so after sign-out no header is sent (AC3).
  - Sends JSON and wraps the body as `{ data }`.
  - Parses the Strapi 5 error shape into `ApiError { status, name, message, details }`. Network failures become `status: 0, name: 'NetworkError'`.
- `me.ts`: `getMe(token?)`, `updateMe(input)`.
- `types.ts`: a `Profile` type matching the `/api/me` response, and the `Role` and `Status` unions.
- Screens never call `fetch` directly.

**B4. Auth state (`src/lib/auth/`)**
- `auth-provider.tsx` and `use-auth.ts` expose:
  - `session`, `profile`, `profileError`, `isLoading`, `isAdmin` (`profile?.role === 'admin' && profile.status === 'active'`)
  - `signIn`, `signUp`, `signOut`, `refreshProfile`
  - `hasSeenWelcome`, `continueAsGuest`
- On mount: `getSession()`, then subscribe to `onAuthStateChange`.
  - **Gotcha from the Supabase docs:** don't await other Supabase calls inside that callback. Defer the profile fetch (`setTimeout(0)`) and pass `session.access_token` explicitly.
  - Fetch `/api/me` on `INITIAL_SESSION` and `SIGNED_IN`, and when the user id changes. Don't refetch on `TOKEN_REFRESHED`.
  - Also refetch when the app returns to the foreground, throttled to every 5 minutes. This makes AC8's "after refresh or relaunch" work without a full restart.
- `signOut`: `supabase.auth.signOut()` (local scope), then clear `profile`. Push-token unregistration is a later task.
- If `/api/me` returns 403, keep the session and set `profileError` ("Your account is suspended…"). The Profile screen shows it with a Sign out button (Q-D).
- `errors.ts`: maps Supabase `AuthError.code` values to plain-language messages: `user_already_exists`, `email_exists`, `weak_password`, `invalid_credentials`, `email_not_confirmed`, `over_request_rate_limit`, plus a network fallback.
  - Also treats `signUp` returning `user.identities.length === 0` as a duplicate. That is how Supabase hides existing emails when confirmation is on (see risk R3).
- `validation.ts`:
  - `PASSWORD_MIN_LENGTH = 8`, and the rule text shown in the UI.
  - Email check.
  - `normalizePhone()`: US 10-digit or `+` E.164 → E.164.
  - `fullName` 1–100.

**B5. UI primitives** (only what these screens need, in `src/components/ui/`)
- `button.tsx`: primary/secondary, loading and disabled states, at least 44 pt.
- `text-field.tsx`: label, helper, error, `accessibilityLabel`.
- `screen.tsx`: safe area + scroll + padding.
- `form-message.tsx`.
- Add placeholder tokens (`primary`, `danger`, `border`) **only** in `src/constants/theme.ts` (Q-010).

**B6. Routes** (`src/app/`)
- `_layout.tsx` (rewritten): `ThemeProvider` → `AuthProvider` → `SplashController` (hides the splash once `isLoading` is false) → root `Stack`:
  ```tsx
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!session && !hasSeenWelcome}>
      <Stack.Screen name="welcome" />
    </Stack.Protected>
    <Stack.Screen name="(tabs)" />
    <Stack.Protected guard={!session}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack.Protected>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="profile" />
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
    </Stack.Protected>
  </Stack>
  ```
  When a guard turns false, the router falls back to the first available screen (no `redirectTo` in SDK 57). After sign-in that is `(tabs)`. After sign-out, protected screens disappear.
- `(tabs)/_layout.tsx` (new): renders the existing `AppTabs` (`app-tabs.tsx`/`.web.tsx`, unchanged; group names don't change URLs).
- `(tabs)/index.tsx` and `(tabs)/explore.tsx`: moved from the root. Home gets a minimal header action: "Sign in" for guests, "Profile" when signed in. The final tab structure and branding are out of scope.
- `welcome.tsx`: Get started → `/sign-up`; Sign in → `/sign-in`; Continue as guest → `continueAsGuest()`. The flag is stored in `expo-sqlite` `localStorage` under the key `hhhna.hasSeenWelcome`.
- `sign-up.tsx`:
  - Fields: full name, email, phone, password, confirm password. The password rules are always visible.
  - Validates on blur and on submit. Submit is disabled while the request is in flight. Entered data is kept on errors.
  - Calls `supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } })` (`api.md` §1).
  - If no session comes back (confirmation on), show an inline "Check your email" state (flow 1, step 4; deep-link return is out of scope, Q-F).
- `sign-in.tsx`: email + password, inline errors, link to sign up. No "Forgot password" (out of scope).
- `profile.tsx`:
  - Shows name, email and role. For admins it also shows an "Admin dashboard" link.
  - Shows a sign-out button.
  - States: loading spinner; error with retry (calls `refreshProfile`); suspended message.
- `admin/_layout.tsx` (a Stack) and `admin/index.tsx`: a placeholder that says "Admin dashboard – coming soon" and states that the server enforces access.

**B7. App tests** (`src/__tests__/` or next to the code, `*-test.ts(x)`; mocked at `@/lib/supabase` and `@/lib/api`)
- `lib/api/client-test.ts`: a header is sent when there is a session; **no header** when the session is null; Strapi error normalization; network error.
- `lib/auth/validation-test.ts`: password rules, phone normalization, email.
- `lib/auth/errors-test.ts`: duplicate email from both the error code and the empty-identities case.
- `sign-up-test.tsx`: rules are visible; password mismatch blocks submit; duplicate-email message shown with data kept; double submit is prevented.
- `sign-in-test.tsx`: invalid-credentials message.
- `routing-test.tsx` (`expo-router/testing-library` `renderRouter`, with a mocked auth context): guest → `/profile` falls back; resident → `/admin` unreachable; admin → `/admin` renders; after sign-out `/profile` is unreachable.
- Jest setup: add `jest.setupFiles` with a mock for `expo-sqlite/localStorage/install` if needed.

### C. Tooling, CI and docs
- **`.github/workflows/ci.yml`**: in the `backend` job, add `- run: npm test` after `npm run build`. No secrets are needed: in-memory SQLite and a local JWKS server. `better-sqlite3` has prebuilt binaries for Node 22 on Linux.
- **Docs to update in the same change (AC11):**
  - `api.md` §2: exact `/api/me` request and response shape (`{ data: {...} }`, `documentId`, `suspendedUntil`), the `PUT` body `{ data: {...} }`, ignored fields, 400/401/403 cases.
  - `api.md` §3: env var names.
  - `security.md`:
    - the middleware is scoped to `/api`;
    - algorithm pinning;
    - HS256 is optional;
    - routes use `auth: false` + `global::*` policies;
    - the users-permissions lockdown;
    - the suspended semantics.
  - `data-model.md`: note the `column.unique` DB index and the lazy-create defaults. No new fields.
  - `development.md`: backend `npm test`, the promote script, and changing the dev Supabase password length.
  - `architecture.md`: `src/lib/` is no longer "(planned)".
  - `decisions.md`: new D-entries (jose v5, SQLite test DB, route-auth pattern), and the new open questions from §8.
  - `backend/README.md` and `backend/.env.example`.
  - `ui-spec.md`: note that `/welcome` is gated by a stored flag.

---

## 4. Key design choices

| # | Choice | Why | Alternatives |
| --- | --- | --- | --- |
| D1 | Global middleware for authentication (scoped to `/api`) + `global::` policies for authorization; custom routes use `auth: false` | Matches the brief and `security.md`. Avoids the users-permissions strategy returning 401 on Supabase tokens. Policies give us the exact 401/403 semantics | Only a custom Strapi auth strategy (more Strapi-native, but the brief asks for a middleware). D4 combines both |
| D2 | Real DB unique index (`column.unique`) + in-process promise de-duplication + catch-and-refetch | `unique: true` alone is racy (finding 1). Works for one or more instances | Postgres advisory lock (doesn't work on SQLite tests); a migration (Strapi migrations run *before* schema sync, so on a fresh DB the table may not exist yet); a `bootstrap()` raw `CREATE UNIQUE INDEX` (Strapi's schema diff may drop unknown indexes). `column` is marked experimental in the Strapi types, so I'd add a test that asserts the index exists |
| D3 | `jose@^5` | Supabase's recommended library, works with JWKS ES256/RS256 and HS256; CJS build works under Jest and the CJS Strapi build | `jose@6` (ESM-only, breaks Jest); `jsonwebtoken` + `jwks-rsa` (two libraries, weaker algorithm handling); calling Supabase `/auth/v1/user` on every request (adds latency and a network dependency) |
| D4 | (Optional) register a `supabase` content-API strategy that grants the Public role's ability to verified users | Prevents signed-in users getting 401 on public core routes in later tasks | Make every future route `auth: false` + policies (works, but easy to forget) |
| D5 | Profile fields on creation come from JWT claims (`email`, `user_metadata.full_name/phone`); role and status are hard-coded | One round trip. Metadata is user-editable, which is fine for display fields but never for role (rule 3) | Send the name and phone in a first `PUT /api/me` after sign-up (extra step; a crash in between leaves a nameless profile) |
| D6 | `/api/me` uses an explicit serializer, not `sanitizeOutput` | The owner must see their own private `email`/`phone`; an allow-list is safer than a block-list | Content-API sanitizers with a custom auth context (more complex) |
| D7 | `PUT /api/me` silently ignores forbidden keys (200) instead of returning 400 | `security.md`: "If a request body includes them, they are ignored." AC6 says "cannot change" | Return 400 on unknown keys (stricter; see Q-G) |
| D8 | Protection lives in the root `Stack`; tabs move to `(tabs)` | `NativeTabs` doesn't support `Protected`; SDK 57 has no `redirectTo` | `Redirect` components inside screens (the SDK ≤52 pattern; the docs now recommend protected routes) |
| D9 | Promote by email from the `profile.email` mirror; the user must sign in once first | No Supabase secret key needed in a script; simple | Look up `auth.users` through the Supabase Admin API with the secret key and create the profile (more power, more secret handling) |
| D10 | Backend tests on in-memory SQLite, following the official guide | Fast, no Docker in CI | Postgres service container in CI (closer to production; could be added later as a matrix entry) |

---

## 5. How each acceptance criterion will be verified

| AC | Verification |
| --- | --- |
| 1 Sign-up, duplicate email, password rules | App tests: `sign-up-test.tsx`, `validation-test.ts`, `errors-test.ts`. Supabase dashboard minimum length set to 8, matching `PASSWORD_MIN_LENGTH`. Manual run of flow 1 on the iOS simulator and Android emulator with a real dev project: new account; same email again → "An account with this email already exists"; 7-character password → rule error from both the client and Supabase (`weak_password`) |
| 2 Sign-in + session survives restart | Manual: sign in, kill the app, relaunch → still signed in (Profile shows data). Unit: the provider restores the session from a mocked `getSession` |
| 3 Sign-out | `routing-test.tsx` (protected screens unreachable after sign-out); `client-test.ts` (no `Authorization` header when the session is null). Manual: sign out → `/profile` deep link (`historichunterhills://profile`) falls back to Home |
| 4 Exactly one profile, defaults, concurrency | Backend `me.test.js`: first `GET` creates `role=resident`, `status=active`, `supabaseUserId=sub`; a second `GET` returns the same `documentId`; `Promise.all` of 10 concurrent `GET`s for a new `sub` → `strapi.db.query('api::profile.profile').count({ where: { supabaseUserId } }) === 1`; a test asserts the unique index exists |
| 5 `/api/me` status codes | `auth-middleware.test.js` + `me.test.js`: no token → 401; garbage / bad `Bearer` format → 401; wrong key → 401; tampered payload → 401; expired → 401; wrong `iss` → 401; wrong `aud` → 401; `alg: none` → 401; HS256 with no secret configured → 401; valid ES256 → 200 with own profile; valid HS256 when configured → 200; banned → 403; suspended until the future → 403; suspended until the past → 200 |
| 6 `PUT` can't change role, status, `supabaseUserId` | `me.test.js`: body with `role: 'admin'`, `status: 'active'`, `supabaseUserId: <other>`, `email` → 200, allowed fields changed, protected fields unchanged in the DB; validation 400s; guest 401; banned 403 |
| 7 `is-admin` | `policies.test.js` against the test-only route: guest 401, resident 403, admin 200, banned admin 403 |
| 8 Promotion script → admin UI | `promote-admin.test.js` (promotes; case-insensitive; unknown email error; duplicate error). Manual: `npm run promote-admin -- me@x` against the dev DB → relaunch the app (or foreground refresh) → Profile shows role "admin" and the "Admin dashboard" link → `/admin` opens |
| 9 No secrets | `git grep -nE "sb_secret_\|service_role\|SUPABASE_JWT_SECRET=.+\|DATABASE_PASSWORD=.+"` on tracked files (only placeholders allowed). `npx expo export --platform ios` (output to a scratch dir), then grep the bundle for `sb_secret_`, `service_role`, `JWT_SECRET`; only the URL and publishable key should appear. `backend/.env.example` documents the new variables |
| 10 Checks pass, CI | Local `npm run check`; `cd backend && npm run build && npm test`; CI workflow updated, and a green run on the PR |
| 11 Docs | Doc updates listed in §3C, in the same PR; the PR checklist names each one |

**Also:** `admin-panel-unaffected.test.js` checks that `GET /admin/init` with a junk `Bearer` is not 401'd by our middleware. A separate test checks that `GET /api/profiles` returns 404 (no core routes).

**What I can't verify without the team:** the real Supabase signing-key mode (ES256 vs legacy HS256), and email-confirmation behavior. Those are manual checks once the dev credentials are shared.

---

## 6. Ordering and dependencies
1. Step 0 (commit the scaffold, get credentials).
2. Backend: A1, A2, A3, A10 harness skeleton (prove an empty Strapi boots in Jest), A4, A5, A6, A7, then A8/A9 as decided. Write the tests alongside each step.
3. CI backend `npm test`.
4. App: B1 (including prebuild and dev-client rebuild), B2, B3, B4, B5, B6, B7.
5. Manual end-to-end against the dev Supabase project and a local Strapi: flow 1, sign-in, restart, sign-out, promotion.
6. Docs (AC11), then the final `npm run check` and backend build + test.

---

## 7. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R1 | `column.unique` is marked experimental and could change in a Strapi upgrade | A test asserts the unique index exists; the app-level de-duplication still prevents most races |
| R2 | The Strapi testing harness (runtime TS loader) is new and may be brittle with our TS config | Fallback: compile with `tsc` to `dist/` and use `createStrapi({ distDir })` in tests |
| R3 | With email confirmation **on**, Supabase hides duplicate emails (anti-enumeration). The `identities: []` heuristic does work, but it leaks account existence, which conflicts in spirit with `security.md`'s anti-enumeration stance for recovery | Q-H |
| R4 | `expo-sqlite` adds native code. The committed `ios/` must be regenerated (D-008) and every developer needs a new dev build | Call it out in the PR; run `npx expo prebuild` and don't hand-edit |
| R5 | Clock skew or JWKS fetch failure → 401s | Small clock tolerance; jose cooldown and refetch; log JWKS errors as `warn` without token contents. If JWKS can't be reached, the request fails with 401 (or 503? see Q-I) |
| R6 | HS256 shared-secret fallback is discouraged by Supabase | Off unless `SUPABASE_JWT_SECRET` is set; documented as legacy only |
| R7 | Supabase `user_metadata` is user-editable, so name and phone in claims can't be trusted | Used only for initial display fields, never for role or status |
| R8 | Moving routes into `(tabs)` and adding a root `Stack` can change the initial route or splash behavior | Routing tests + manual check on both platforms |
| R9 | `typedRoutes` types for new routes are generated into the gitignored `.expo/types`, so CI typecheck sees untyped `href`s | Acceptable (falls back to string); note it |

---

## 8. Open questions, assumptions and spec issues

New questions to add to `docs/decisions.md` (proposed IDs):

- **Q-A (new). Supabase tokens on core routes.** Should this task add the `supabase` content-API strategy (D4)? Without it, future public core routes return 401 to signed-in users. **Recommendation:** yes, small and tested. Alternatives: (2) a rule that every route is `auth: false` + policies; (3) the app omits the token on public GETs (contradicts `api.md`).
- **Q-B (new). How to test AC7.** There is no real admin route yet. **Recommendation:** a test-only route in the harness. Alternative: a minimal real endpoint now (e.g. a stub `GET /api/admin/summary`), but stub data is misleading.
- **Q-C (new). Profile created without a name.** `fullName` is required, but a user created outside the app (dashboard or invite) has no `full_name` in metadata. **Recommendation:** fall back to the email local part, which the user can edit later. Alternative: make `fullName` optional in `data-model.md`.
- **Q-D (spec gap). Suspension semantics.** What does `status = suspended` with `suspendedUntil = null` mean? I assume **indefinite**. When `suspendedUntil` has passed, I assume access is allowed with no write-back to `active`. Is that right? And what should the app show a suspended user: a message plus sign-out (my assumption) or a forced sign-out?
- **Q-E (new). Lock down users-permissions now (A8)?** `security.md` says its endpoints are disabled, but no task does it. **Recommendation:** yes, in this task.
- **Q-F (spec gap). Email confirmation deep link.** Flow 1 step 4 says the confirmation link "returns to the app, already signed in". With `detectSessionInUrl: false` this needs a `Linking` handler plus `verifyOtp`/`exchangeCodeForSession` and the Supabase redirect-URL configuration. Not in the task's scope list. **Assumption:** out of scope; with confirmation on, the user confirms and then signs in manually. Confirmation stays off in dev, per the brief's recommendation.
- **Q-G. `PUT /api/me` with forbidden keys:** silently ignore (my default, per `security.md`) or 400?
- **Q-H. Duplicate-email message vs. enumeration** (R3): accept showing "already registered" (AC1), or show a neutral "check your email" message when confirmation is on?
- **Q-I. JWKS endpoint unreachable:** 401 (current spec wording) or 503 (more honest; lets the app say "try again")? **Default:** 401.

Spec issues to flag (not decisions I'll make silently):

1. **`api.md` vs. Strapi 5 conventions.**
   - The `/api/me` response lists `id`; Strapi 5 addresses records by `documentId`. I'll return `documentId` (no numeric `id`).
   - `api.md` doesn't say whether the body is wrapped in `{ data }`. I'll wrap both the response and the `PUT` body, following the "Response shape" convention in `api.md`.
   - Please confirm.
2. **Supabase docs vs. our spec on HS256.**
   - `api.md` §3 and the brief ask for an HS256 secret fallback.
   - Supabase docs "strongly recommend against" verifying HS256 locally; they recommend asymmetric keys or the `/auth/v1/user` endpoint.
   - Not a hard contradiction (it says "only if the project still uses it"), but per AGENTS.md I'm reporting it. **Recommendation:** make sure the dev and prod projects use asymmetric (ES256) signing keys, and keep HS256 strictly opt-in.
3. **`ui-spec.md` says to "Check the SDK 57 docs for `Stack.Protected`."** Confirmed it exists in 57. `redirectTo` is 58+ and `NativeTabs` doesn't support `Protected`. This forces the root-`Stack` + `(tabs)` restructure, which touches the "final tab structure" listed as out of scope. I'm keeping the tab contents unchanged.
4. **Is phone required?** AC1 and Flow 1 collect it, but `data-model.md` doesn't mark it required. **Assumption:** required in the sign-up UI (US numbers normalized to E.164), nullable in the schema and via `PUT`.
5. **Password policy** is only "min 8 characters" (`security.md`). The Supabase dashboard must be set to match. Character-class requirements are not specified, so I won't add them.
6. **`lastSeenAt`** is "updated (throttled) by the auth middleware". I picked 15 minutes, which is a small reversible detail.
7. **Q-001 still applies:** the client must confirm who the initial admin is before anyone runs the script against production.
8. **Promotions aren't logged.** `data-model.md` says every role change is logged in `admin-activity-log`, which doesn't exist yet. The seed script's promotion won't be logged; noted as a follow-up for the admin-users task.

---

### Critical files for implementation
- `backend/src/middlewares/supabase-auth.ts` (new; with `src/utils/supabase-jwt.ts` and the profile resolver)
- `backend/src/api/profile/content-types/profile/schema.json` (new; with `src/api/profile/routes/01-me.ts`, `controllers/me.ts`, `src/policies/is-authenticated.ts`, `src/policies/is-admin.ts`)
- `backend/config/middlewares.ts` (register `global::supabase-auth`; plus new `config/supabase.ts`, `config/env/test/database.ts`, `tests/strapi.js`)
- `src/app/_layout.tsx` (root `Stack` + `Protected` guards + `AuthProvider`; tabs move to `src/app/(tabs)/`)
- `src/lib/auth/auth-provider.tsx` (new; with `src/lib/supabase.ts` and `src/lib/api/client.ts`)

Other files to touch: `.github/workflows/ci.yml`, `backend/package.json`, `backend/.env.example`, `backend/tsconfig.json`, `backend/src/index.ts`, `src/constants/theme.ts`, `app.json` (through `npx expo install`), and the docs listed in §3C.

---

## Review notes (for the team's Go/No-Go discussion)

The orchestrating agent wrote these first-pass notes. **The team should review the plan together and record its own verdict here.**

**Where the plan follows our requirements and design:**
- It keeps the architecture rules in `AGENTS.md`: the role comes only from the DB, ownership is set server-side, the app uses Supabase only for auth, and no secrets reach the client.
- Every acceptance criterion maps to a concrete automated or manual check (§5), including authorization tests for guest, resident, admin and banned users.
- It found real problems that the specs didn't anticipate, and it raised them instead of deciding them silently:
  - `unique` isn't a DB constraint.
  - Strapi's built-in auth rejects Supabase tokens on core routes.
  - The admin panel's tokens would hit a global middleware.
  - `NativeTabs` doesn't support `Protected`.

**What we'd likely change or decide before approving:**
- **Q-A: say yes.** Add the Supabase content-API strategy now. Every later feature has public routes that signed-in users will call.
- **Q-E: say yes.** Lock down users-permissions in this task.
- **Q-H: prefer the neutral "check your email" message** when confirmation is on. That matches `security.md`'s anti-enumeration rule. It means changing AC1 to "duplicate emails are rejected *when detectable without enumeration*".
- **Spec fix:** `api.md` should say `documentId` instead of `id` for `/api/me` and state the `{ data }` wrapper. Accept the agent's interpretation.
- **Correction to finding 10:** `expo-env.d.ts` is **not** tracked (`git ls-files` doesn't list it), so no action is needed. The bundle-identifier typo (`org.historichunerhills`) is real. Fix it before the first store submission, because it can't be changed after that.
- **Scope check:** the plan is large for one PR. Consider splitting it into **001a backend** (A1–A10 + CI) and **001b app** (B1–B7). Each still has testable ACs.
