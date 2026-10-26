# Supabase backend

Supabase holds **auth and all private/resident data** for the Historic Hunter Hills app; staff
content (alerts, events, housing programs/listings, library, app copy) lives in **Sanity**
(project `nxvenp1m`, dataset `production`). The app talks to Supabase directly with the
publishable key and the user's session, so **Row Level Security is the authorization layer**:
anything not explicitly granted is denied. Sanity document ids are stored as plain `text`
(`event_id`, `housing_program_id`, `alert_id`).

```
supabase/
  config.toml                 local stack config (+ verify_jwt=false for the 3 functions)
  migrations/                 schema, RLS, triggers, RPCs, Storage buckets, cron, grants
  seed.sql                    local seed: environment readings only
  scripts/seed-demo.ts        local demo users + resident data (needs the Auth admin API)
  tests/database/*.test.sql   pgTAP: RLS/RPC behaviour per role; each file rolls back
  functions/
    send-alert/               Sanity webhook → Expo push (idempotent per alert)
    send-reminders/           cron, every 5 min → event reminder pushes
    sync-environment/         cron, every 30 min → NWS + AirNow readings, prune > 30 days
    _shared/                  pure logic (push, Sanity signature, reminders, fetchers)
    tests/*_test.ts           unit tests for _shared (deno test or node --test)
```

## Local development

Needs Docker. The CLI is a devDependency (`npx supabase …`).

```sh
npx supabase start                 # local stack (Postgres, Auth, Storage, Edge runtime, Studio)
npx supabase db reset              # re-apply migrations + seed.sql
npx supabase test db               # pgTAP suite (supabase/tests/database)
npx supabase status -o env         # local URL and keys for the app / scripts

# Demo residents, reports with a placeholder photo, a reminder and an inquiry (local only):
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<from status> \
  node --experimental-strip-types supabase/scripts/seed-demo.ts
# accounts: denise.carter@example.com, marcus.hill@example.com, admin@example.com (admin)
# password: $DEMO_PASSWORD or "hunter-hills-demo"

# Edge Functions
cp supabase/functions/.env.example supabase/functions/.env   # fill in; gitignored
npx supabase functions serve --env-file supabase/functions/.env
deno test supabase/functions/tests/          # or, without Deno:
node --test --experimental-strip-types supabase/functions/tests/*_test.ts
```

Point the app at the local stack with `EXPO_PUBLIC_SUPABASE_URL=http://<your LAN IP>:54321`
and the local publishable key.

## Hosted project (`lxwkbstypsyiscjegvgp`)

```sh
npx supabase login                                  # needs the user's access token
npx supabase link --project-ref lxwkbstypsyiscjegvgp
npx supabase migration list                         # compare local vs remote history
npx supabase db push                                # apply new migrations
npx supabase test db --linked                       # or: --db-url "$SUPABASE_DB_URL"
```

Without `link`, every command accepts `--db-url "$SUPABASE_DB_URL"` (direct connection string,
from the dashboard; never commit it). The test files run in a transaction that is rolled
back, so running them against the shared project leaves nothing behind.

If the remote history still lists the deleted Strapi-era migration `20261019000000`, mark it
reverted first (this only edits the history table, not the `strapi` schema):
`npx supabase migration repair --status reverted 20261019000000`.

### Edge Function secrets and deploy

```sh
npx supabase secrets set --env-file supabase/functions/.env   # values from .env.example
npx supabase functions deploy send-alert
npx supabase functions deploy send-reminders
npx supabase functions deploy sync-environment
```

`config.toml` turns off the gateway JWT check for these three (`verify_jwt = false`): they
are called by Sanity (HMAC signature) and pg_cron (`x-cron-secret`), never with a user JWT,
and each one authenticates its caller itself. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are
injected by the platform.

| Secret | Used by | Notes |
| --- | --- | --- |
| `SANITY_WEBHOOK_SECRET` | send-alert | Same value as the Sanity webhook's secret |
| `CRON_SECRET` | send-reminders, sync-environment | Same value as Vault `cron_secret` |
| `PUSH_ENABLED` | send-alert, send-reminders | `true` to actually call Expo |
| `EXPO_ACCESS_TOKEN` | push | Only with Expo enhanced push security |
| `NWS_USER_AGENT` | sync-environment | e.g. `HistoricHunterHillsApp/1.0 (team@example.org)`; NWS is skipped without it |
| `AIRNOW_API_KEY` | sync-environment | AirNow is skipped without it |
| `DISTRICT_CENTROID` | sync-environment | Optional, default `33.759,-84.425` |
| `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_VERSION`, `SANITY_READ_TOKEN` | send-reminders | Optional event lookup (deleted → reminder removed, moved → rescheduled). Assumes event fields `title`, `startsAt` |

### Sanity webhook (alerts → push)

sanity.io/manage → project `nxvenp1m` → API → Webhooks → Create:

- **URL** `https://lxwkbstypsyiscjegvgp.supabase.co/functions/v1/send-alert`
- **Dataset** `production`; **Trigger on** Create and Update; **Drafts** off
- **Filter** `_type == "alert"`
- **Projection** `{_id, title, message, category, endsAt}`
- **HTTP method** POST; **Secret** a long random string → also `SANITY_WEBHOOK_SECRET`

The first delivery for an alert `_id` pushes; later ones (edits, Sanity retries) only refresh
the stored title/`ends_at` (used for the home card's active-alert count). Push payload:
`{ type: 'notification', documentId: <alert _id>, category }`.

### Cron (pg_cron + pg_net)

The jobs `hhha-send-reminders` (`*/5 * * * *`) and `hhha-sync-environment` (`*/30 * * * *`)
are created by the migration but do nothing until these Vault secrets exist (SQL editor):

```sql
select vault.create_secret('https://lxwkbstypsyiscjegvgp.supabase.co', 'project_url');
select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 20;` and
responses with `select * from net._http_response order by created desc limit 20;`.

### First admin (Q-001)

Sign up in the app, then in the SQL editor: `select public.promote_admin_by_email('you@example.org');`
After that, admins manage roles in the app (`admin_set_role`).

## Rules for new migrations

- New tables: `alter table … enable row level security;`, `revoke all … from anon, authenticated;`,
  then grant only what a policy needs (column lists for insert/update where possible).
- New functions: `revoke all on function … from public, anon, authenticated;` and grant
  explicitly; SECURITY DEFINER functions must `set search_path = ''`.
- `tests/database/090_grants.test.sql` lists exactly what anon/authenticated can reach; it
  fails until you review and update it.
