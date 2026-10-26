# Data Model

> Changed 2026-10-19: Strapi was replaced by **Sanity** (content) + **Supabase** (resident data). See D-024.

Data lives in two places:

- **Content (Sanity)**: what Foundation staff write and publish. Alerts, events, housing programs and listings, library items, and editable app text. Project `nxvenp1m`, dataset `production`, which is **public** (D-025). Schemas: `studio/schemaTypes/`.
- **Resident data (Supabase)**: everything tied to a person, or anything private. Profiles, blight reports, reminders, inquiries, push tokens, alert deliveries, environment readings, and the admin log. Schema: `supabase/migrations/`.

Identity (email, phone, password hash, verification) lives in Supabase **`auth.users`**. We never copy passwords anywhere.

Conventions:
- Enumeration values are `snake_case` strings. They are the same in Sanity (`studio/schemaTypes/shared/options.ts`), Postgres enums, and `src/lib/api/types.ts`. Display labels live in the app (and the Studio titles).
- Sanity field names are `camelCase`. Postgres columns are `snake_case`, and `src/lib/api/resident.ts` maps them to the app's camelCase types.
- The app type field `documentId` is the Sanity `_id` for content, and the primary key (as a string) for Supabase rows.
- Supabase stores references to Sanity documents as plain `text` (`event_id`, `housing_program_id`, `alert_id`). There is no foreign key across the two systems.
- **Never store anything private in Sanity.** Anyone can read the dataset without a token.
- Moderated records are **soft-deleted** (`status = removed`), never deleted.

## Mapping from the Detailed Design v1 ERD

| ERD entity | Implementation |
| --- | --- |
| Users | Supabase `auth.users` (credentials) + `public.profiles` (role, status, display info, preferences) |
| BlightReports | `public.blight_reports` |
| BlightImages | `public.blight_report_photos` + Storage bucket `blight-photos` |
| Events | Sanity `event` |
| EventReminders | `public.event_reminders` |
| HousingResources | Sanity `housingProgram` |
| HousingInquiries | `public.housing_inquiries` |
| HousingAttachments | Storage bucket `inquiry-attachments` (private), path `{user_id}/{inquiry_id}/{file}` |
| NotificationPreferences | `notif_*` columns on `profiles` |
| Notifications | Sanity `alert` (content) + `public.alert_deliveries` (delivery record) |
| Resources | Sanity `libraryResource` |
| EnvironmentalData / EnvironmentalSources | `public.environment_readings` (the source is a text column) |
| AdminActivityLog | `public.admin_activity_log` |
| *(new)* | Sanity `housingListing`: open affordable-housing units |
| *(new)* | Sanity `appCopy`: editable app text (singleton, D-027) |
| *(new)* | `public.push_tokens`: Expo push tokens per device |

---

## Content (Sanity)

Sanity adds `_id`, `_type`, `_createdAt`, `_updatedAt` and `_rev` to every document, so they aren't repeated below. Only **published** documents reach the app: the app queries the public CDN API, which never returns drafts. "Required" means Studio validation blocks publishing without the field.

### `alert` ("Alert")
Publishing an alert sends a push (through the `send-alert` webhook; see `api.md` §3). Studio list order: newest `sentAt` first.

| Field | Type | Validation / notes |
| --- | --- | --- |
| `title` | string | required, ≤ 65 (push title) |
| `message` | text | required, ≤ 240 (push body and list text) |
| `category` | string: `emergency` \| `health_warning` \| `community_announcement` \| `meeting_reminder` | required. Emergency goes to everyone. Alerts filter chips: Emergency, Health, Community (Community includes meeting reminders) |
| `issuer` | string | e.g. "City of Atlanta Watershed Management" |
| `body` | text ("Details") | full alert text |
| `actionSteps` | array of string ("What to do now") | ≤ 8 |
| `affectedArea` | text | plain-language area description |
| `sentAt` | datetime ("Issued at") | required, defaults to now |
| `endsAt` | datetime | optional, must be after `sentAt`. After this time the alert shows as ended |

### `event` ("Event")
Studio list order: by `startsAt`. Times are stored in UTC and shown in `America/New_York`.

| Field | Type | Validation / notes |
| --- | --- | --- |
| `title` | string | required, ≤ 120 |
| `eventType` | string: `workforce_development` \| `financial_literacy` \| `wellness` \| `civic_meeting` \| `community_gathering` \| `other` | required |
| `startsAt` | datetime | required |
| `endsAt` | datetime | required, after `startsAt` |
| `description` | text | required |
| `locationName` | string ("Place") | e.g. "Hunter Hills Community Center" |
| `address` | string | used for "Get directions" |
| `neighborhood` | string, options from *Neighborhoods* | optional. The app type is `Neighborhood \| null` |
| `costLabel` | string ("Cost") | e.g. "Free" |
| `costNote` | string | e.g. "Dinner and childcare provided" |

### `housingProgram` ("Housing program")
Shown under Housing as programs (app type `HousingResource`).

| Field | Type | Validation / notes |
| --- | --- | --- |
| `title` | string | required |
| `category` | string: `rental_assistance` \| `eviction_prevention` \| `affordable_housing` \| `homeownership` \| `home_repair` | required |
| `summary` | text | required, ≤ 300 |
| `highlights` | array of `{ value, label }` | ≤ 3 items. `value` required ≤ 16, `label` required ≤ 24 (e.g. "Up to 3" / "months of rent") |
| `eligibility` | array of string ("Who can apply") | optional. The UI shows "not available" when empty |
| `requiredMaterials` | array of string ("What you'll need") | optional |
| `contactName` | string | |
| `contactPhone` | string | E.164 (`^\+[1-9]\d{1,14}$`), e.g. `+14045550142` |
| `contactEmail` | string | email |
| `website` | url | |
| `acceptsInquiries` | boolean | initial `true`. The app reads a missing value as `true` |
| `inquiryAllowsAttachments` | boolean | initial `true`. The app reads a missing value as `true` |

### `housingListing` ("Housing listing")
Open affordable-housing units ("Open listings"). The app lists them newest first (`_createdAt`).

| Field | Type | Validation / notes |
| --- | --- | --- |
| `title` | string | required, e.g. "2-bedroom apartment" |
| `address` | string | required |
| `neighborhood` | string, options from *Neighborhoods* | optional |
| `rentLabel` | string ("Rent") | e.g. "$950/mo" |
| `bedrooms` | number | integer ≥ 0 |
| `image` | image (hotspot) with `alt` | optional. The app receives `imageUrl` (`image.asset->url`) |
| `url` | url ("Where to apply") | |
| `availableFrom` | date | |

### `libraryResource` ("Library item")

| Field | Type | Validation / notes |
| --- | --- | --- |
| `title` | string | required |
| `description` | text | required, ≤ 300 |
| `category` | string: `financial_tools` \| `health` \| `education` \| `small_business` | required. UI labels: Money, Health, Education, Small business |
| `resourceType` | string: `article` \| `video` \| `link` | required |
| `url` | url | required unless `resourceType = article`. Videos are YouTube/Vimeo links; we don't host video |
| `body` | Portable Text ("Article text") | styles `normal` and `h2`, bullet lists, `strong` only. The app converts it to its Markdown subset (`portableTextToMarkdown`) |
| `source` | string | e.g. "Fulton County Health" |
| `durationMinutes` | number | integer ≥ 1 |
| `featured` | boolean ("Show as Start here") | initial `false` |
| `thumbnail` | image (hotspot) with `alt` | optional. The app doesn't query it yet |

### `appCopy` ("App text"), singleton
One document with the fixed id **`appCopy`** (D-027). The Studio can't create a second one, duplicate it, or delete it (`sanity.config.ts`). Every field is optional. The app caches the document on the device and uses its built-in wording (`src/lib/app-copy.ts`, `defaultCopy`) for any blank field.

| Group | Fields |
| --- | --- |
| Welcome & home | `welcomeTagline` (text) |
| Housing | `evictionBannerTitle`, `evictionBannerBody` (string), `inquiryConfirmation` (text) |
| Reporting | `reportingSteps` (array of string, ≤ 5), `emergencyNotice` (string) |
| Neighborhood data | `airQualityExplainer`, `waterQualityExplainer`, `heatExplainer`, `mosquitoExplainer`, `heatMapNote` (text) |

---

## Resident data (Supabase)

All tables are in schema `public`, with **RLS on**. Default privileges are revoked, so `anon`/`authenticated` can reach only what is granted explicitly (see `security.md` and `api.md` §2). Timestamps are `timestamptz`. Client-entered text goes through `clean_text()`, which strips control characters and HTML tags, trims, and turns `''` into `null`.

### `profiles`
One row per `auth.users` row. It is created by the `on_auth_user_created` trigger (`handle_new_user`).

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | uuid | PK, FK → `auth.users(id)` on delete cascade |
| `full_name` | text | not null, 1–100 chars. From `user_metadata.full_name`, else the email's local part (Q-C), else "Resident" |
| `email` | text | mirror of the auth email, kept in sync by the `on_auth_user_email_changed` trigger. Used for admin search. Auth stays the source of truth |
| `phone` | text | E.164 (`^\+[1-9][0-9]{1,14}$`) or null. Kept from sign-up metadata only if valid |
| `role` | `app_role`: `resident` \| `admin` | default `resident`. Changed only through `admin_set_role` / `promote_admin_by_email` |
| `status` | `account_status`: `active` \| `suspended` \| `banned` | default `active`. Changed only through `admin_set_status` |
| `suspended_until` | timestamptz | allowed only when `status = suspended` (check constraint). Null = indefinite |
| `neighborhood` | `neighborhood` enum | optional. Drives the home card art |
| `text_size` | `text_size`: `default` \| `large` \| `extra_large` | default `default` |
| `language` | `app_language`: `en` \| `es` | default `en`. Only English copy exists (Q-016) |
| `notif_health_warnings`, `notif_community_announcements`, `notif_meeting_reminders` | boolean | default `true`. Emergency alerts have no setting because they are always on |
| `last_seen_at` | timestamptz | set by `touch_last_seen()` (at most every 15 min) |
| `created_at`, `updated_at` | timestamptz | `updated_at` is set by trigger |

Triggers:
- `profiles_guard` (before update): a direct client update may not change `id`, `role`, `status`, `suspended_until`, `email`, `last_seen_at` or `created_at` (`42501`). This also enforces the last-admin invariant.
- `profiles_guard_delete` (before delete): enforces the last-admin invariant.
- `profiles_audit` (after update): logs `role_granted`/`role_revoked` and `account_suspended`/`account_banned`/`account_reactivated`.

**Invariant:** at least one profile with `role = admin` and `status = active` must exist. `assert_admin_remains()` takes an advisory lock, so two admins can't demote each other at the same time. A violation raises `P0001` "At least one active admin must remain" (hint `last_admin`).

"Blocked" (`account_is_blocked`) means `banned`, or `suspended` with no end or an end in the future. Once `suspended_until` passes, access returns; `status` isn't written back (Q-D).

### `blight_reports`
Base table. Only the reporter and admins can read it. Everyone else reads `public_blight_reports`.

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | bigint identity, starts at 1001 | PK. Shown as "Report #N" |
| `reporter_id` | uuid | default `auth.uid()`, FK → `profiles` **on delete set null** (deleting an account anonymizes its reports, Q-003). **Private** |
| `category` | `blight_category`: `illegal_dumping` \| `vacant_lot` \| `abandoned_building` \| `standing_water` \| `air_odor` \| `other` | not null |
| `description` | text | ≤ 2000, optional |
| `latitude` | numeric(9,6) | not null, 33.73–33.81 (District 3 bounding box) |
| `longitude` | numeric(9,6) | not null, −84.49 to −84.37 |
| `address` | text | ≤ 300, optional |
| `keep_name_private` | boolean | default `true`. When true, admins leave the reporter's name out when they forward the report to the City. **Private** |
| `status` | `blight_status`: `submitted` \| `under_review` \| `reported_to_city` \| `resolved` \| `removed` | default `submitted`. UI labels: Submitted, Under review, Sent to the City, Resolved. `removed` is the soft delete |
| `status_history` | jsonb array `[{ status, at }]` | maintained by triggers. Drives the progress timeline |
| `resolution_note` | text | ≤ 2000. Admin-only edit. **Private** |
| `resolved_at` | timestamptz | set by trigger when status becomes `resolved` |
| `created_at`, `updated_at` | timestamptz | |

"Active" means `status ∈ {submitted, under_review, reported_to_city}`.

Triggers:
- `blight_reports_before_insert`: for client inserts, forces `reporter_id = auth.uid()` and `status = submitted`, clears the server fields, cleans the text and seeds `status_history`.
- `blight_reports_before_update`: keeps `id`, `reporter_id`, `created_at`, `status_history` and `resolved_at` server-owned, appends to `status_history` on a status change, sets `resolved_at`, and cleans the text.
- `blight_reports_audit` (after update): logs `report_status_changed`, `report_removed` or `report_edited` with a from/to diff.

There is no DELETE privilege or policy.

### `blight_report_photos`

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | bigint identity | PK |
| `report_id` | bigint | FK → `blight_reports` on delete cascade |
| `storage_path` | text | unique. Object name in bucket `blight-photos`: `{report_id}/{file}.jpg\|jpeg\|png\|webp` (file name `[A-Za-z0-9._-]{1,128}`). The first segment must equal `report_id`. **There is no user id in the path** |
| `created_at` | timestamptz | |

The `blight_report_photos_limit` trigger allows at most **5 photos** per report. The app requires at least 1 before it shows the report as sent. A row can be attached only by the reporter, while the report is `submitted` and less than 24 h old, and only once the object exists in Storage (`can_attach_blight_photo`).

### `public_blight_reports` (view)
Active reports for everyone, guests included. Columns: `id, category, description, latitude, longitude, address, status, status_history, photo_paths (text[]), resolved_at, created_at, updated_at`. It never includes `reporter_id`, `keep_name_private` or `resolution_note`. It runs with the owner's rights and uses `security_barrier`.

### `event_reminders`

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | default `auth.uid()`, FK → `profiles` on delete cascade |
| `event_id` | text | Sanity event `_id`, 1–200 chars |
| `event_title` | text | ≤ 200. Copied from Sanity by the app so the cron can build the push |
| `event_starts_at` | timestamptz | not null. Inserting a reminder for an event that has already started raises `22023` |
| `remind_at` | timestamptz | computed by trigger (`default_remind_at`, Q-004): 24 h before the start, else 1 h before, else now |
| `sent_at` | timestamptz | null until claimed by `send-reminders` |
| `created_at` | timestamptz | |

Unique `(user_id, event_id)`: a duplicate gives `23505`, which the app maps to 409. When `event_starts_at` changes (`send-reminders` syncs reschedules from Sanity), the trigger recomputes `remind_at` and clears `sent_at`. Reminders for events deleted in Sanity are removed by `send-reminders` when its Sanity lookup is configured.

### `housing_inquiries`

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | default `auth.uid()`, FK → `profiles` on delete cascade. Forced to the caller on insert |
| `housing_program_id` | text | Sanity `housingProgram` `_id`, 1–200 |
| `housing_program_title` | text | ≤ 200. Snapshot of the title at submission (for admin lists and exports) |
| `message` | text | not null, 1–4000 |
| `preferred_contact` | `contact_method`: `email` \| `phone` | not null |
| `status` | `inquiry_status`: `new` \| `in_progress` \| `closed` | default `new`. Forced to `new` on insert |
| `admin_notes` | text | ≤ 4000. **Admin-only**: not selectable by any client role on the base table. Admins read it through `admin_housing_inquiries` |
| `created_at`, `updated_at` | timestamptz | |

`housing_inquiries_audit` logs `inquiry_status_changed`. Attachments live in the `inquiry-attachments` bucket under `{user_id}/{inquiry_id}/{file}.pdf|jpg|jpeg|png|heic`: at most 5, ≤ 10 MB each, and uploadable only within 24 h of the inquiry. The database doesn't check `acceptsInquiries` / `inquiryAllowsAttachments`, which live in Sanity. The app enforces them.

### `push_tokens`

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `token` | text | PK. `^Expo(nent)?PushToken\[…\]$`, ≤ 255 |
| `user_id` | uuid | FK → `profiles` **on delete set null**. Null for guests (Q-005) |
| `platform` | `push_platform`: `ios` \| `android` | not null |
| `last_registered_at`, `created_at` | timestamptz | |

Clients have no table privileges at all. Tokens are written through `register_push_token` / `unregister_push_token`, and the Edge Functions delete them when Expo reports `DeviceNotRegistered`.

### `alert_deliveries`
One row per Sanity alert that `send-alert` processed. It makes the webhook idempotent, and it holds the data behind the active-alert count.

| Column | Type | Notes |
| --- | --- | --- |
| `alert_id` | text | PK, Sanity `_id` |
| `category` | `alert_category` | |
| `title` | text | refreshed on later webhook calls |
| `ends_at` | timestamptz | refreshed on later webhook calls |
| `sent_at` | timestamptz | first delivery time |
| `completed_at`, `recipient_count`, `ok_count`, `removed_tokens` | | outcome |
| `pushed` | boolean | `false` when `PUSH_ENABLED` was off (recorded, never sent later) |

### `environment_readings`
A cache. `sync-environment` prunes readings with `observed_at` older than 30 days.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | PK |
| `category` | `environment_category`: `temperature` \| `air_quality` \| `water_quality` \| `mosquito` \| `heat` | |
| `value` | numeric | e.g. AQI or °F |
| `unit` | text | |
| `level` | `environment_level`: `good` \| `moderate` \| `unhealthy_sensitive` \| `unhealthy` \| `very_unhealthy` \| `hazardous` \| `unknown` | default `unknown` |
| `summary` | text | |
| `observed_at` | timestamptz | from the source, **not** fetch time |
| `source` | text | display name, e.g. "National Weather Service", "AirNow (EPA)" |
| `latitude`, `longitude` | numeric(9,6) | the station or grid the reading applies to, **never** a user's location |
| `raw` | jsonb | original payload. **Private**: never returned to clients. For NWS `temperature` it holds `{ conditions, highF, lowF, hourly: [{ time, temperatureF }] }`, which `environment_glance()` uses |
| `created_at` | timestamptz | |

Unique `(category, source, observed_at)`. Stale thresholds: temperature, heat and AQI 3 h; water and mosquito 7 days. Water quality and mosquito readings are admin-entered (`admin_add_environment_reading`, Q-009).

### `admin_activity_log`
**Append-only.** Triggers reject every UPDATE, DELETE and TRUNCATE, even for the service role. The only writer is `log_admin_action()`, which is called from triggers and security-definer functions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | PK |
| `actor_id` | uuid | the acting admin's auth uid. Deliberately **no FK**, so entries survive account deletion. Null for changes made outside a user session (SQL editor, scripts, the Sanity webhook) |
| `action` | `admin_action`: `role_granted` \| `role_revoked` \| `account_suspended` \| `account_banned` \| `account_reactivated` \| `report_status_changed` \| `report_edited` \| `report_removed` \| `inquiry_status_changed` \| `notification_sent` \| `environment_reading_added` \| `data_exported` | |
| `target_type` | text | e.g. `profile`, `blight_report`, `housing_inquiry`, `alert`, `environment_reading`, `blight_reports` |
| `target_id` | text | |
| `details` | jsonb | from/to diff or context |
| `created_at` | timestamptz | |

Content edits in the Sanity Studio are not in this log. Sanity keeps its own document history.

### Admin views
- `admin_activity`: the log plus `actor_full_name`.
- `admin_housing_inquiries`: inquiries with `admin_notes`, `resident_full_name`, `resident_email`, `resident_phone`, and `attachments` (`[{ path, name, mimeType, size }]`).

Both are filtered by `is_admin()`, so they are empty for everyone else.

## Neighborhoods
Boundaries come from the City of Atlanta's official Neighborhoods layer (Department of City Planning, `OpenDataService1` layer 3), bundled as `src/data/neighborhoods.json` and refreshed with `python3 scripts/fetch-neighborhoods.py`. The NPU of each neighborhood comes from the same layer.

Enum values used by `profiles.neighborhood` (Postgres enum `neighborhood`) and by Sanity `housingListing.neighborhood` / `event.neighborhood`. They match the neighborhood art in the Figma design system: `english_avenue`, `vine_city`, `hunter_hills`, `washington_park`, `bankhead` (Historic Westin Heights / Bankhead), `knight_park` (Knight Park / Howell Station), `dixie_hills`, `west_lake`, `center_hill`, `harvel_homes` (Harvel Homes Community), `georgia_tech`.

## Relationships (summary)

```
auth.users 1──1 profiles
profiles 1──* blight_reports 1──* blight_report_photos ──▶ storage blight-photos/{report_id}/…
profiles 1──* event_reminders ──(event_id)──▶ Sanity event
profiles 1──* housing_inquiries ──(housing_program_id)──▶ Sanity housingProgram
                └── storage inquiry-attachments/{user_id}/{inquiry_id}/…
profiles 1──* push_tokens (user_id null = guest)
Sanity alert ──(alert_id)── alert_deliveries
admin_activity_log.actor_id ··▶ profiles (no FK)
```
