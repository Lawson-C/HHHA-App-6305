# Product Specification

## Problem

Residents of Historic Hunter Hills and the surrounding Atlanta **District 3** neighborhoods have trouble getting timely information about housing opportunities, environmental risks, blight, and community and health resources. That information is spread across many platforms. The problem hits long-term residents facing displacement hardest.

District 3 neighborhoods: Bankhead, English Avenue, Grove Park, Home Park, Hunter Hills, Knight Park/Howell Station, Vine City, Washington Park, West Lake, Castleberry Hill.

## Goal

Build one mobile app (iOS + Android) that gathers neighborhood information and services in a single place. It supports HHHNA's mission of anti-displacement, environmental preservation and generational wealth-building.

## Users and roles

| Role | Who | Can do |
| --- | --- | --- |
| **Guest** | Anyone who installs the app, not signed in | View public content: home "Neighborhood at a glance", environmental data, public blight reports, calendar events, housing resources, resource library |
| **Resident** | Signed-in user (basic access) | Everything a guest can do, plus submit blight reports, set event reminders, submit housing inquiries (with attachments), manage profile and notification preferences, receive push notifications |
| **Admin** (also "Admin/Volunteer") | HHHNA Foundation staff or volunteers | Everything a resident can do, plus moderate and resolve blight reports, manage events, housing resources and the resource library, view housing inquiries, send notifications, grant or revoke admin, disable accounts, view the admin activity log, export data |

Non-functional requirements from the client: **usable by all age groups**, **custom HHHNA branding**, works on **Android and iOS**.

## Features (MVP scope)

The numbers match the Iteration Plan.

### F1. Accounts
- Sign up with name, email, phone number and password. Email or phone is the username. Email must be unique.
- Log in and log out. Sessions persist across app launches. Account data survives logout.
- Recover the account through a verified email (phone/SMS is an open question, see `decisions.md`). Recovery links and codes are single-use and expire.
- Admins grant and revoke admin. Admins disable accounts temporarily or permanently. There must always be at least one admin. Every change is written to the admin activity log.
- Users view and edit their own profile. The password is never displayed. Changing a sensitive field (email, phone, password) requires re-authentication or verification.
- The **initial admin account and the admin-assignment process must be agreed with the client.**

### F2. Blight reporting
- A resident submits a report with: a category (e.g. *Illegal Dumping*, *Vacant Lot*, *Environmental Concern*), a description, one or more photos, and a geotagged location (current GPS position or a pin on the map). The app shows a review step before submit and a success message after.
- Anyone, including guests, can view **active** (non-resolved, non-removed) reports, with image, description, category, status and location, on a map or list. The list can be filtered by category, distance and status.
- Admins can edit, change status, resolve, or remove (moderate) reports. Resolved and removed reports disappear from the public view but are **never hard-deleted**. Every admin change is logged.
- Avoid duplicates: warn when a report of the same category already exists nearby.
- Reports are later forwarded by admins to the City of Atlanta (Blight Tax Ordinance). The app does not submit to the city automatically.
- Never show the reporter's identity or other private data publicly.

### F3. Community calendar
- A month view with navigation between months. Days that have events are marked (a dot). Tapping a day lists its events.
- An event has a title, description, date, start time, end time, event type and (optionally) a location.
- Filter by event type: workforce development, financial literacy, wellness, civic meetings, community gatherings/festivals. Clearing the filter shows all events.
- A signed-in user can set and remove a reminder on an event (no duplicates). The reminder is delivered as a push notification (F5).
- Admins create, edit and remove events. Incomplete events are rejected with clear feedback. Removing an event also removes its reminders.

### F4. Housing resources portal
- Categories: **affordable housing, eviction prevention, rental assistance, homeownership** ("Find help by need").
- A detail page per resource shows eligibility, required materials, contact info, and a "Start inquiry" button. When a field has no data, the page says so clearly.
- A signed-in user submits an inquiry linked to a resource, with required fields and optional attachments. Users see only their own inquiries.
- Admins manage housing resources and view inquiries and their attachments.

### F5. Push notifications
- Categories: **emergency alerts** (always on, cannot be disabled), **health warnings**, **community announcements**, **meeting reminders**.
- Users toggle each category except emergency on their profile.
- Admins compose a notification (title, message, category). It is delivered only to users who opted in, except emergency alerts, which go to everyone. Each sent notification is stored with its sender and time.

### F6. Environmental data dashboard
- Location-based display of temperature/weather, air quality, water quality, mosquito-prone areas and heat zones.
- Ask for location permission. If it is denied, fall back to the neighborhood centroid. Do not store precise user location for this feature.
- Missing or stale data must show a clear "data not available / last updated …" state. Never show stale data as if it were current.
- The home screen has a **"Neighborhood at a glance"** card that summarizes this data and links to the dashboard (Task Scenario 3).

### F7. Resource library
- Articles, videos and links in the categories **education, financial tools, health tips, small business support**.
- Filter by category or "View all". A detail view shows the title, description, category, type and the link or media.
- Admins add, edit and remove entries. Users have read-only access.

### F8. Navigation and admin dashboard
- A consistent tab navigation for everyone. Guests can reach the public features. Restricted actions prompt sign-in.
- Admins get an **Admin Dashboard** that links to every admin feature, with summary stats (pending reports and similar) and recent admin activity.

## Also requested by the client (post-MVP unless prioritized)
- **Building and tree-removal permit tracking** through 9mile.us (see `integrations.md`).
- **Data export** (CSV) of blight reports and housing inquiries for grant reporting.
- **Engagement tracking** for admins.
- **Two-way communication / civic participation**: not yet specified.
- **Training materials**: a resident quick-start guide and an admin handbook.
- **Deliverables**: source repo, UX/UI design files, and API/data-source documentation.

## Out of scope (for now)
- Automatic submission of reports to City of Atlanta systems.
- A web version of the resident app. Expo can build for web, but we don't target or test it.
- Payments, chat or messaging between residents.
