# Task 001: Authentication & Roles Foundation

**Source:** Iteration Plan → Global Setup & Infrastructure ("Basic user authentication and admin roles can be supported"; "backend can communicate with the database"), plus Feature 1 User Stories 1–2 (core only).
**Why first:** almost every feature depends on knowing who the caller is and whether they're an admin (blight reports, reminders, inquiries, notifications, the admin dashboard). It also proves the whole stack end to end: app → Supabase Auth → Strapi → Supabase Postgres.

## Goal
A user can sign up, sign in, stay signed in and sign out in the app through Supabase Auth. Strapi verifies the user's Supabase JWT on every request and resolves it to a `profile` with a role (`resident` | `admin`) and status. The app knows the current user's role and can gate UI with it, and Strapi can enforce "authenticated" and "admin" access on routes.

## In scope
**Backend (`backend/`)**
- `profile` content type exactly as specified in `docs/data-model.md`, including the `notification.preferences` component.
- Supabase JWT verification (JWKS, with an HS256 secret fallback, both configured through `backend/.env`), implemented as a global middleware that sets `ctx.state.profile` (lazily creating the profile on the first request).
- Reusable route policies: `global::is-authenticated`, `global::is-admin` (both reject suspended or banned profiles with `403`).
- `GET /api/me` and `PUT /api/me` (only `fullName`, `phone`, `notificationPreferences` are editable).
- A seed/CLI script to promote a user to admin by email (initial admin, Q-001).
- A backend test harness (Jest + supertest) with tests for the above.

**App (repo root)**
- Supabase client (`src/lib/supabase.ts`), configured per the Expo SDK 57 Supabase guide (`expo-sqlite/localStorage`, `detectSessionInUrl: false`, AppState-driven auto-refresh).
- API client (`src/lib/api/`) that attaches the bearer token and normalizes errors.
- Auth context/provider exposing `session`, `profile` (from `/api/me`), `isAdmin`, `signIn`, `signUp`, `signOut`, and a loading state.
- Screens: Welcome (Get started / Sign in / Continue as guest), Sign up (name, email, phone, password + confirm), Sign in, and a minimal Profile screen (shows name, email and role, with a Sign out button).
- Route protection: Profile requires a session. An `admin` placeholder route is visible and reachable only when `isAdmin`.
- `.env.example` entries (already present) used through `process.env.EXPO_PUBLIC_*`.

## Out of scope (later tasks)
Password recovery UI, phone/SMS verification, profile editing UI, admin user-management screens, account deletion, push tokens, CAPTCHA, the final tab structure and branding.

## Acceptance criteria
1. A new user can create an account with name, email, phone and password from the app. Duplicate emails are rejected with a clear message. Password rules are shown and enforced.
2. A user can sign in with email and password, and the session survives an app restart.
3. A user can sign out. After sign-out, protected screens are no longer reachable and API calls go out without a token.
4. On the first authenticated request, Strapi creates exactly one `profile` for the Supabase user (`supabaseUserId` = JWT `sub`) with role `resident` and status `active`. Repeated or concurrent requests don't create duplicates.
5. `GET /api/me` returns `401` with no token, `401` with an invalid, expired or tampered token, `200` with the caller's own profile for a valid token, and `403` for a banned or suspended profile.
6. `PUT /api/me` cannot change `role`, `status` or `supabaseUserId`, even if they are sent in the body.
7. A route guarded by `global::is-admin` returns `403` for a resident and `200` for an admin.
8. The admin promotion script makes a given email's profile an admin, and the app then shows admin-only UI for that user after refresh or relaunch.
9. No secret keys appear in the app bundle or in committed files. `backend/.env.example` documents the new variables.
10. `npm run check` (root) and `npm run build` + `npm test` (backend) pass. CI runs the backend tests.
11. `docs/` is updated wherever the implementation adds or changes anything (e.g. exact env var names, endpoints).

## Relevant specs
`docs/architecture.md`, `docs/security.md` (identity bridge, authorization), `docs/api.md` §1–3, `docs/data-model.md` (`profile`), `docs/design/ui-spec.md`, `docs/design/user-flows.md` §1, `docs/decisions.md` (D-004, D-005, D-012, Q-001).

## Prerequisites the team must provide
- A Supabase dev project: URL, publishable key, and (for Strapi) JWKS/JWT settings plus the DB session-pooler string, all shared privately.
- A decision on whether email confirmation is on in the dev project (recommended: off for dev, on for prod).
