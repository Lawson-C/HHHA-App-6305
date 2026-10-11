# Data Model

All application data is stored as **Strapi content types** in Supabase Postgres, schema `strapi`. Identity (email, phone, password hash, verification) lives in Supabase **`auth.users`**, and we never duplicate passwords anywhere.

Conventions:
- Strapi collection API IDs are kebab-case singular (e.g. `api::blight-report.blight-report`). REST paths are plural (`/api/blight-reports`).
- Strapi automatically adds `id`, `documentId`, `createdAt`, `updatedAt`, `publishedAt` (when Draft & Publish is on) and locale fields. They are not repeated below.
- Enumeration values are `snake_case` strings. Labels for display live in the app.
- "Private" means the field must never appear in a response to anyone except the owner or an admin. In Strapi, mark these `private: true` or strip them in controllers/sanitizers.
- Records referenced by reports or inquiries are **soft-deleted** (`status = removed`) rather than deleted.

## Mapping from the Detailed Design v1 ERD

| ERD entity | Implementation |
| --- | --- |
| Users | Supabase `auth.users` (credentials) + Strapi `profile` (role, status, display info) |
| BlightReports | `blight-report` |
| BlightImages | `images` media field on `blight-report` (Strapi's `files` table + Supabase Storage) |
| Events | `event` |
| EventReminders | `event-reminder` |
| HousingResources | `housing-resource` |
| HousingInquiries | `housing-inquiry` |
| HousingAttachments | `attachments` media field on `housing-inquiry` (private bucket) |
| NotificationPreferences | `notificationPreferences` component on `profile` (1:1, so a component is simpler) |
| Notifications | `notification` |
| Resources | `library-resource` (named so it doesn't clash with the generic word "resource") |
| EnvironmentalData / EnvironmentalSources | `environmental-reading` / `environmental-source` |
| AdminActivityLog | `admin-activity-log` |
| *(new)* | `push-token`: Expo push tokens per device |

## Entities

### `profile`
One per Supabase user. Created lazily on the first authenticated request (`GET /api/me`).

| Field | Type | Constraints / notes |
| --- | --- | --- |
| `supabaseUserId` | uuid (string) | **required, unique**. Equals `auth.users.id` (JWT `sub`) |
| `fullName` | string | required at sign-up, 1–100 chars |
| `email` | email | mirror of the auth email, for admin search. Auth stays the source of truth. Private |
| `phone` | string | E.164 format. Private |
| `role` | enum `resident` \| `admin` | default `resident`. Only admins can change it |
| `status` | enum `active` \| `suspended` \| `banned` | default `active` |
| `suspendedUntil` | datetime | set when `status = suspended` |
| `notificationPreferences` | component `notification.preferences` | see below |
| `lastSeenAt` | datetime | updated (throttled) by the auth middleware |

Invariant: **at least one `profile` with `role = admin` and `status = active` must exist.** Reject any demotion or ban that would break this.

Component `notification.preferences`: `healthWarnings` bool (default true), `communityAnnouncements` bool (default true), `meetingReminders` bool (default true). Emergency alerts have no field because they are always on.

### `blight-report`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `category` | enum `illegal_dumping` \| `vacant_lot` \| `environmental_concern` \| `other` | required |
| `description` | text | required, 10–2000 chars, plain text (sanitize) |
| `latitude`, `longitude` | decimal | required. Must be inside the District 3 bounding box (configurable) |
| `address` | string | optional, from reverse geocoding |
| `images` | media (multiple, images only) | 1–5 files. jpeg/png/heic/webp. ≤ 10 MB each |
| `status` | enum `submitted` \| `under_review` \| `reported_to_city` \| `resolved` \| `removed` | default `submitted` |
| `resolutionNote` | text | admin-only edit |
| `resolvedAt` | datetime | set when status → `resolved` |
| `reporter` | relation many-to-one → `profile` | required. **Private:** never shown in public responses |

"Active" means `status ∈ {submitted, under_review, reported_to_city}`.

### `event`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `title` | string | required, ≤ 120 |
| `description` | rich text / text | required |
| `startsAt` | datetime (UTC) | required |
| `endsAt` | datetime (UTC) | required, > `startsAt` |
| `eventType` | enum `workforce_development` \| `financial_literacy` \| `wellness` \| `civic_meeting` \| `community_gathering` \| `other` | required |
| `location` | string | optional (address or venue) |
| `neighborhood` | string | optional |

Times are stored in UTC and displayed in `America/New_York`. Draft & Publish is **on**, so admins can stage events before they appear.

### `event-reminder`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `profile` | relation many-to-one → `profile` | required |
| `event` | relation many-to-one → `event` | required |
| `remindAt` | datetime | default `event.startsAt − 24h` (open question Q-004) |
| `sentAt` | datetime | null until sent |

Unique `(profile, event)`. Delete the event's reminders when the event is deleted or unpublished.

### `housing-resource`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `title` | string | required |
| `category` | enum `affordable_housing` \| `eviction_prevention` \| `rental_assistance` \| `homeownership` | required |
| `summary` | text | required |
| `eligibility` | rich text | optional. The UI shows "not available" when empty |
| `requiredMaterials` | rich text | optional |
| `contactName`, `contactPhone`, `contactEmail`, `website` | strings | optional |
| `acceptsInquiries` | boolean | default true |
| `inquiryAllowsAttachments` | boolean | default true |

Draft & Publish **on**.

### `housing-inquiry`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `profile` | relation many-to-one → `profile` | required, set server-side from the JWT (never from the request body) |
| `housingResource` | relation many-to-one → `housing-resource` | required |
| `message` | text | required, ≤ 4000 |
| `preferredContact` | enum `email` \| `phone` | required |
| `attachments` | media (multiple: pdf, jpeg, png, heic) | optional, ≤ 5 files, ≤ 10 MB each. Private bucket |
| `status` | enum `new` \| `in_progress` \| `closed` | default `new` |
| `adminNotes` | text | admin-only |

Visible only to the owner and admins.

### `notification`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `title` | string | required, ≤ 65 (push title limit) |
| `message` | text | required, ≤ 240 |
| `category` | enum `emergency` \| `health_warning` \| `community_announcement` \| `meeting_reminder` | required |
| `sentBy` | relation many-to-one → `profile` | the sending admin |
| `sentAt` | datetime | set when sent |
| `recipientCount` | integer | set after fan-out |

### `push-token`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `token` | string | required, **unique** (`ExponentPushToken[...]`) |
| `profile` | relation many-to-one → `profile` | optional. A guest device can still get emergency alerts (open question Q-005) |
| `platform` | enum `ios` \| `android` | |
| `lastRegisteredAt` | datetime | |

Delete the token when Expo returns `DeviceNotRegistered`.

### `library-resource`
| Field | Type | Constraints / notes |
| --- | --- | --- |
| `title` | string | required |
| `description` | text | required |
| `category` | enum `education` \| `financial_tools` \| `health` \| `small_business` | required |
| `resourceType` | enum `article` \| `video` \| `link` | required |
| `url` | string (URL) | required for `video` and `link` |
| `body` | rich text | optional (for in-app articles) |
| `thumbnail` | media (single image) | optional |

Videos and articles are external links. We don't host video files. Draft & Publish **on**.

### `environmental-source`
| Field | Type | Notes |
| --- | --- | --- |
| `key` | uid | e.g. `airnow`, `nws` |
| `name`, `url` | string | |
| `categories` | json (array of category enums) | which categories this source provides |
| `lastFetchedAt`, `lastError` | datetime, text | for monitoring |

### `environmental-reading`
| Field | Type | Notes |
| --- | --- | --- |
| `source` | relation → `environmental-source` | |
| `category` | enum `temperature` \| `air_quality` \| `water_quality` \| `mosquito` \| `heat` | |
| `latitude`, `longitude` | decimal | the location the reading applies to (station or grid), **not** a user's location |
| `value` | decimal | e.g. AQI or °F |
| `unit` | string | |
| `level` | enum `good` \| `moderate` \| `unhealthy_sensitive` \| `unhealthy` \| `very_unhealthy` \| `hazardous` \| `unknown` | normalized severity for the UI color scale |
| `summary` | string | human-readable |
| `observedAt` | datetime | from the source, **not** fetch time |
| `raw` | json | original payload (private) |

Readings are a cache. Prune readings older than 30 days.

### `admin-activity-log`
Append-only. No update or delete endpoints, not even for admins.

| Field | Type | Notes |
| --- | --- | --- |
| `actor` | relation → `profile` | admin who acted |
| `action` | enum `role_granted` \| `role_revoked` \| `account_suspended` \| `account_banned` \| `account_reactivated` \| `report_status_changed` \| `report_edited` \| `report_removed` \| `event_created` \| `event_updated` \| `event_deleted` \| `housing_resource_changed` \| `library_resource_changed` \| `notification_sent` \| `data_exported` | |
| `targetType` | string | content-type UID |
| `targetId` | string | `documentId` of the target |
| `details` | json | before and after diff or context |

Changes made in the Strapi **admin panel** (not the app) are logged through document-service middleware, so both paths produce entries.

## Relationships (summary)

```
profile 1──* blight-report        profile 1──* housing-inquiry *──1 housing-resource
profile 1──* event-reminder *──1 event
profile 1──* push-token           profile 1──* notification (sentBy)
profile 1──* admin-activity-log   environmental-source 1──* environmental-reading
```
