# Decisions & Open Questions

Add an entry whenever a design decision is made or changed. Agents: **don't decide anything listed under Open Questions yourself.** Implement the stated default only if the entry gives one, and point it out in your summary.

## Decisions

| ID | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D-001 | **React Native + Expo (SDK 57)** frontend, TypeScript strict, Expo Router | Client requires both iOS and Android from one codebase | Accepted (Design v1) |
| D-002 | **Strapi 5** as backend + CMS (chosen over Payload) | Non-technical Foundation staff need an easy admin UI for events, resources and moderation | Accepted (Design v1) |
| D-003 | **Supabase** for Postgres, Auth and Storage (chosen over Firebase) | Relational data fits Postgres. Official RN support. Free tier | Accepted (Design v1) |
| D-004 | Strapi uses Supabase Postgres in schema **`strapi`**. The app talks to Strapi for **all** data, and to Supabase **only for auth** | Design v1 says "no broad client-side DB access". One authorization layer is simpler to reason about than RLS + Strapi policies together | Proposed (this repo). Refines Design v1's RLS wording: RLS stays as deny-by-default protection, while Strapi policies enforce the actual rules |
| D-005 | Strapi verifies **Supabase JWTs** (JWKS). App role and status live on the Strapi `profile` content type. Strapi users-permissions login is not used | Single identity provider. Role can't be forged through user-editable metadata | Proposed |
| D-006 | Uploads go to **Supabase Storage through the S3 provider** in Strapi. Housing attachments go in a private bucket with signed URLs | Design v1: files in Supabase Storage, DB stores references | Proposed |
| D-007 | Push through **Expo Push Service** (`expo-notifications`), sent from Strapi | Easiest cross-platform path with EAS | Proposed |
| D-008 | `ios/` is currently committed. **Recommendation:** switch to Continuous Native Generation (gitignore `ios/` and `android/`, generate with `npx expo prebuild`/EAS) | Committed native folders drift from `app.json` config plugins (e.g. adding `expo-sqlite`, `expo-location`) | **Team to confirm.** Until then, don't hand-edit `ios/` and re-run prebuild after config changes |
| D-009 | Tooling: ESLint (`eslint-config-expo` flat) + Prettier, `tsc --noEmit`, Jest (`jest-expo`) + React Native Testing Library, GitHub Actions CI | Expo-recommended defaults | Accepted (this repo) |
| D-010 | Node **22 LTS** (`.nvmrc`) | Strapi 5 supports LTS only. Expo SDK 57 supports it | Accepted |
| D-011 | Blight status lifecycle `submitted → under_review → reported_to_city → resolved`, plus `removed` (moderation). Soft delete only | Combines the two status lists in the Iteration Plan. Admin log "call backs" need retained records | Proposed |
| D-012 | Email + password is the sign-in method. Phone is collected but not verified in v1 | SMS costs money and needs a provider decision (Q-002) | Proposed |

## Open questions

| ID | Question | Owner | Default until answered |
| --- | --- | --- | --- |
| Q-001 | Who is the initial admin, and how are new admins approved? | Client | Team seeds one admin through a script. Only admins can promote |
| Q-002 | Should phone verification / SMS recovery be in v1? Who pays for SMS? | Client | No. Email only |
| Q-003 | Account deletion: required in v1? What happens to that user's reports and inquiries? | Team + client | Provide deletion. Anonymize reports, delete inquiries |
| Q-004 | When are event reminders sent (24 h before? user-selectable?) | Client | 24 h before, plus 1 h before |
| Q-005 | Do guests (no account) receive emergency push alerts? | Client | Yes, if they grant notification permission |
| Q-006 | Where is Strapi hosted (Strapi Cloud, Render, Railway, Fly…) and who pays? | Team + client | Local-only until decided |
| Q-007 | Which fields should the CSV export include for grant reporting? | Client | Report/inquiry fields without personal contact details |
| Q-008 | Is 9mile.us API access available, and on what terms? | Team | Post-MVP, not blocking |
| Q-009 | Data sources for water quality, mosquito-prone areas and heat zones | Team | Show "not available" cards; AirNow + NWS only |
| Q-010 | Link to Figma / prototype and HHHNA brand assets (logo, colors, font) | Team / client | Template theme tokens |
| Q-011 | Task Scenario 3 mentions public transit info, which isn't in any feature. In or out? | Team + client | Out |
| Q-012 | Do in-app admin screens need to fully duplicate the Strapi admin panel, or only cover moderation and quick actions? | Team | In-app: moderation, notifications, users/roles, dashboard. Content CRUD (events, housing, library) primarily in the Strapi admin panel, with in-app CRUD as stretch |
| Q-013 | Blight duplicate detection: what radius and time window? | Team | Same category within 50 m in the last 30 days → warn, but allow |
