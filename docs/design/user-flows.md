# User Flows

These flows come from the validated **Task Scenarios** used in prototype testing. Build the screens so that each flow works exactly as written. They double as manual end-to-end test scripts.

## 1. Sign up (Task Scenario 1)
1. Install and open the app → **Welcome** screen → tap **Get started**.
2. Enter full name, email (the username), phone number, and password (with the rules shown inline). Confirm the password.
3. Tap **Create account** → Supabase sign-up.
4. If email confirmation is on, show a "Check your email" screen. The confirmation deep link returns to the app, already signed in.
5. The user lands on **Home** as a signed-in resident. `GET /api/me` has created their profile.

Errors: email already registered, weak password, network failure. Each shows an inline message and keeps the entered data.

## 2. Blight report (Task Scenario 2)
1. **Report** tab → **New report**. (Guest → sign-in prompt → return here.)
2. Choose a category, e.g. **Illegal Dumping**.
3. Enter a description.
4. Add a photo (camera or library, up to 5).
5. Set the location: **Use my location** (GPS) or drop a pin on the map. Show the reverse-geocoded address.
6. **Review** screen shows every field with an edit option → **Submit**.
7. A **success** message appears, and the report shows on the map with status *Submitted*.

## 3. Neighborhood checkup (Task Scenario 3)
1. Open the app → **Home**.
2. Read the **Neighborhood at a glance** card: temperature, AQI level, active alerts count.
3. Tap the card → **Environmental dashboard**: air quality, weather/heat, water quality, mosquito-prone areas and active alerts, each with a "last updated" time. (The scenario also mentions *public transit information*, which is not yet a specified feature; see Q-011.)

## 4. Community events (Task Scenario 4)
1. Open the app → **Events** tab.
2. Navigate to the month of interest. Optionally pick event types in the filter chips.
3. Days with events show a dot. Tap a day to see its events (time, title, location).
4. Tap an event → detail → **Remind me** (signed-in only) → confirmation, and the button changes to "Reminder set".

## 5. General resources (Task Scenario 5)
1. Open the app → **Home**.
2. For a housing issue: **Housing** tab → **Find help by need** → pick a category (e.g. Eviction prevention) → resource → detail → optionally **Start inquiry**.
3. Otherwise: **Library** tab → filter by category or **View all** → tap an entry → detail. Play the video or open the article.

## 6. Admin: moderate a blight report
1. Profile → **Admin dashboard** (admins only) → **Reports**, filtered to pending.
2. Open a report → change the status (e.g. *Reported to city*, *Resolved*) and add a note → **Save** → confirmation.
3. A resolved report disappears from the public map. The change appears in **Activity log**.

## 7. Admin: send a notification
1. Admin dashboard → **Send notification** → title, message, category.
2. A preview shows the recipient estimate. **Emergency** shows an extra warning ("goes to everyone").
3. **Send** → confirmation with the recipient count, and the notification is logged.
