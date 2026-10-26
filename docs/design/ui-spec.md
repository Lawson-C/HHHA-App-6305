# UI Specification

**Visual source of truth:** the Figma file [Design Reference](https://www.figma.com/design/HCQobhdAtHlnFF2XCV3pBX/Design-Reference) (decision D-013).
- Page **📱 App Screens**: every screen, grouped 00–08.
- Page **🎨 Design System**: foundations, components, logo, icons, neighborhood art and maps.

This document records structure and behavior, and maps each Figma frame to its code. When copy in Figma and this spec disagree, Figma wins for copy and this spec wins for behavior.

## Foundations (mirrored in `src/constants/theme.ts`)
- **Color.** Figma variable collections *Primitives* → *Color* (semantic: `bg/*`, `text/*`, `border/*`, `status/*`, `category/*`, `accent/*`). Use the semantic names (`Colors.bgBrand`, `Colors.textSecondary`, …), never raw hex.
- **Type.** Frank Ruhl Libre Bold for display and titles. Assistant (Regular, SemiBold, Bold) for UI and body text. Both come from `@expo-google-fonts/*`. The text styles (`Display`, `Title/Large`, `Body/Medium`, …) map to `Typography.*`.
- **Spacing and radius.** `space/4–32`, `radius/sm 8, md 12, lg 16, xl 24, full`. The page gutter is 20.
- **Icons.** Lucide, 24 px, 2 px stroke (`lucide-react-native`).
- **Elevation.** Soft green-tinted shadows (`Shadow.card`, `Shadow.raised`).
- **Light mode only** (D-015).
- **Background.** Most screens sit on the "Aurora" wash (`assets/art/aurora.jpg`). Welcome and Neighborhood use the dark district or neighborhood map art.

## Design principles
- **All ages.** Touch targets of at least 44 pt, body text at least 16 pt, and WCAG AA contrast. Never rely on color alone: pair it with an icon or text. Text scales with the OS setting (capped at 2×) **and** with the in-app Profile → Text size preference.
- **Plain language** labels ("Report an issue", "Find help by need").
- Every data screen handles **loading, empty (with an explanation), error (with retry) and content**: `src/components/ui/states.tsx`.
- **Gate actions, not screens.** Guests can browse everything public. Tapping "Remind me", "Start inquiry" or "Submit report" while signed out goes to Sign in and then returns. A report draft survives the detour.

## Navigation (D-014)

A floating glass tab bar with **Home · Events · Housing · Library**, plus a separate round **Report** button (`src/components/tab-bar.tsx`). Report opens the report flow as a full-screen modal.

| Figma frame | Route | File |
| --- | --- | --- |
| 01 Welcome | `/welcome` | `src/app/welcome.tsx` |
| 01 Quick Start (3 steps) | `/onboarding` | `src/app/onboarding.tsx` |
| 01 Sign In | `/sign-in` | `src/app/sign-in.tsx` (plus `sign-up.tsx`, `forgot-password.tsx`) |
| 02 Home | `/` | `src/app/(tabs)/(home)/index.tsx` |
| 02 Alerts / Alert Detail | `/alerts`, `/alerts/[id]` | `src/app/(tabs)/(home)/alerts/` |
| 02 Neighborhood — Expanded | `/neighborhood` | `src/app/(tabs)/(home)/neighborhood.tsx` |
| 03 Events / Event Detail | `/events`, `/events/[id]` | `src/app/(tabs)/events/` |
| 04 Report: choose type, details, submitted, info sheet | `/report`, `/report/details`, `/report/review`, `/report/submitted` | `src/app/report/` |
| 05 Housing / Housing Program | `/housing`, `/housing/category/[category]`, `/program/[id]`, `/inquiry/[id]` | `src/app/(tabs)/housing/`, `src/app/program/`, `src/app/inquiry/` |
| 06 Environment + AQI / data-sources sheets | `/environment` | `src/app/(tabs)/(home)/environment.tsx` |
| 07 Library / Library Article | `/library`, `/library/[id]` | `src/app/(tabs)/library/` |
| 08 Profile | `/profile` | `src/app/profile.tsx` (plus `my-reports.tsx`) |
| *(not in Figma)* Admin | `/admin`, `/admin/reports`, `/admin/send-alert` | `src/app/admin/` |

**Route guards** live in `src/app/_layout.tsx` (`Stack.Protected`):
- `sign-in`, `sign-up` and `forgot-password` are available only when signed out.
- `profile`, `my-reports` and `inquiry` require a session.
- `admin` requires `isAdmin`.
- `(tabs)/_layout.tsx` redirects first-time visitors to `/welcome`.

The server enforces every rule again.

## Differences from the Figma file (deliberate)
- **Review step.** The report flow adds a "Review" step before submit (user-flows §2).
- **Sign-in field.** It is labeled **Email**, not "Phone or email", until SMS sign-in is decided (D-012, Q-002).
- **Volunteer / Staff segment.** It changes only the helper copy, because the server decides roles. In demo mode it signs in as an admin.
- **Neighborhood — Expanded.** It omits the MARTA transit section (Q-011).
- **Neighborhood card.** It shows the neighborhood the phone is in (on-device, D-029), with a "Use my location" button until location is allowed, "Based on your location" once it is, and a note when the phone is outside District 3.
- **Maps.** Alert and report maps use the static map art from Figma (Q-014).
- **Library article.** It has Share and Open link. Listen, Text size and bookmarks are not built (Q-015). Text size lives in Profile.
- **Profile.** The settings gear is omitted. "Language" shows English only (Q-016).

## Components (`src/components/`)

| Figma component | Code |
| --- | --- |
| Button (8 variants) | `ui/button.tsx`: `primary`, `secondary`, `outline`, `danger`, `inverse`, `ghost` × `large`/`small` |
| Chip, Tag | `ui/chip.tsx` (`Chip`, `ChipRow`), `ui/tag.tsx` |
| Icon Button, Top Bar, Section Header | `ui/icon-button.tsx`, `ui/top-bar.tsx`, `ui/section-header.tsx`, `ui/page-title.tsx` |
| Tab Bar | `tab-bar.tsx` |
| Alert Card, List Row | `alert-row.tsx`, `ui/list-row.tsx` |
| Feature Tile / Inline | `feature-tile.tsx` |
| Event Card | `event-card.tsx` (+ `calendar-month.tsx`) |
| Text Field, Search Field | `ui/text-field.tsx`, `ui/search-field.tsx` |
| Switch, Settings Row | `ui/toggle-row.tsx` |
| Segmented Control | `ui/segmented-control.tsx` |
| Stat Tile | `ui/stat-tile.tsx` |
| Step Indicator | `ui/step-dots.tsx` |
| Info sheets | `ui/sheet.tsx` |
| Logo | `ui/logo.tsx` (PNG exports in `assets/brand/`) |
| Neighborhood Art | `src/lib/neighborhood-art.ts` (`assets/art/*.jpg`) |

## Forms
- Validate on blur and on submit. Show errors under the field in plain language (`src/lib/auth/validation.ts`).
- Disable submit while a request is in flight.
- The report flow has a review step and a confirmation screen. The inquiry form has a confirmation screen.

## Feedback
- Success uses a confirmation screen, or an inline state change ("Reminder set").
- Admin destructive actions always confirm first ("Remove this report?", "Send an emergency alert?").
