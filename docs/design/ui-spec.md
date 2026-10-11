# UI Specification

> The full UI design section arrives in Detailed Design v2. The prototype and Figma files are the visual reference: **add the link here once it's shared** (Q-010). Until then, this document is the source of truth for structure and behavior.

## Design principles
- **All ages:** large touch targets (≥ 44×44 pt), body text ≥ 16 pt, support Dynamic Type / font scaling, WCAG AA contrast, and no meaning carried by color alone (pair it with an icon or text).
- **Plain language** labels ("Report a problem", "Find help by need").
- **Custom HHHNA branding:** brand colors, logo and typeface to come from the client. Until then, use the tokens in `src/constants/theme.ts` and change colors only there.
- Light and dark mode (`userInterfaceStyle: automatic`).
- Every data screen has four states: **loading**, **empty** (with explanation), **error** (with retry), and **content**.
- Gate restricted actions, not screens. Guests can browse everything public. Tapping a restricted action (e.g. "Submit report", "Remind me") opens the sign-in prompt and returns to the action afterwards.

## Navigation

Bottom tabs (`NativeTabs` from `expo-router/unstable-native-tabs`, already in the template):

| Tab | Route | Contents |
| --- | --- | --- |
| **Home** | `/(tabs)/index` | Greeting, **"Neighborhood at a glance"** card (weather, AQI, active alerts) → environmental dashboard; recent notifications; quick actions (Report blight, Upcoming events) |
| **Events** | `/(tabs)/events` | Month calendar with event-day dots and a type filter chip row. The selected day's list sits below the calendar. Event detail is a pushed screen with "Remind me" |
| **Report** | `/(tabs)/report` | Map/list of active blight reports with filters (category, status, distance). A "New report" button starts the report flow (stack) |
| **Housing** | `/(tabs)/housing` | "Find help by need" category tiles → resource list → resource detail → inquiry form |
| **Library** | `/(tabs)/library` | Category filter + "View all" → list → detail (opens video or article links in the in-app browser through `expo-web-browser`) |

Other routes (stack, outside the tabs):
- `/welcome` (first launch: "Get started", sign in, or "Continue as guest")
- `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` (deep link)
- `/profile` (header avatar button on every tab): account info, notification preferences, my reports, my inquiries, sign out
- `/environment`: environmental dashboard
- `/admin/*` (shown only when `role = admin`, linked from profile): dashboard, reports moderation, events, housing resources and inquiries, library, send notification, users & roles, activity log

The protected route groups (`/admin`, resident-only screens) use Expo Router's protected-route guards. Check the SDK 57 docs for `Stack.Protected`. **The server still enforces everything.**

## Key components (to build in `src/components/`)
- `Screen` (safe-area + scroll + standard padding), `Button` (primary, secondary, destructive; loading state), `TextField` (label, error, helper), `Card`, `Chip`/`FilterChips`, `EmptyState`, `ErrorState`, `StatusBadge` (blight and inquiry status), `AqiBadge` (level → color + label), `CalendarMonth`, `MapView` wrapper, `ImagePickerGrid`, `SignInPrompt`.

## Forms
- Validate on blur and on submit. Show errors under the field in plain language.
- Disable the submit button while a request is in flight. Prevent double submits.
- The blight report and housing inquiry forms have a **review step** before submit and a confirmation screen after.

## Feedback
- Success: a toast or confirmation screen with a clear next step.
- Admin actions always confirm destructive operations ("Remove this report?") and show a result message.
