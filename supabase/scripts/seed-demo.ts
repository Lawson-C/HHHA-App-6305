/**
 * Demo residents for LOCAL development: auth users (through the Auth admin API, so the profile
 * trigger runs), one admin, a few blight reports (with a placeholder photo), a reminder and a
 * housing inquiry. Idempotent: re-running skips what already exists.
 *
 *   npx supabase status -o env            # shows API_URL and SERVICE_ROLE_KEY / SECRET_KEY
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
 *     node --experimental-strip-types supabase/scripts/seed-demo.ts
 *
 * Refuses to run against a non-local URL unless --allow-remote is passed. Event and housing
 * program ids are placeholders (DEMO_EVENT_ID / DEMO_HOUSING_PROGRAM_ID) because that content
 * lives in Sanity.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '';
const password = process.env.DEMO_PASSWORD ?? 'hunter-hills-demo';
const eventId = process.env.DEMO_EVENT_ID ?? 'demo-event';
const eventTitle = process.env.DEMO_EVENT_TITLE ?? 'Budgeting basics workshop';
const programId = process.env.DEMO_HOUSING_PROGRAM_ID ?? 'demo-housing-program';
const programTitle = process.env.DEMO_HOUSING_PROGRAM_TITLE ?? 'Emergency rental assistance';

if (!key) {
  console.error(
    'Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY); see `npx supabase status -o env`.',
  );
  process.exit(1);
}
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
if (!isLocal && !process.argv.includes('--allow-remote')) {
  console.error(
    `Refusing to seed demo users into ${new URL(url).host}. Pass --allow-remote if you really mean it.`,
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
// 1×1 transparent PNG (placeholder photo).
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

type DemoUser = {
  email: string;
  fullName: string;
  phone?: string;
  admin?: boolean;
  neighborhood?: string;
};
const USERS: DemoUser[] = [
  {
    email: 'denise.carter@example.com',
    fullName: 'Denise Carter',
    phone: '+14045550142',
    neighborhood: 'english_avenue',
  },
  { email: 'marcus.hill@example.com', fullName: 'Marcus Hill', neighborhood: 'vine_city' },
  { email: 'admin@example.com', fullName: 'Foundation Admin', admin: true },
];

async function must<T>(
  label: string,
  promise: PromiseLike<{ data: T; error: unknown }>,
): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error)
    throw new Error(`${label}: ${(error as { message?: string }).message ?? String(error)}`);
  return data as NonNullable<T>;
}

async function ensureUser(user: DemoUser): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName, ...(user.phone ? { phone: user.phone } : {}) },
  });
  if (data?.user) return data.user.id;
  // Already registered: find it.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error(`listUsers: ${listError.message}`);
  const existing = list.users.find((u) => u.email?.toLowerCase() === user.email);
  if (!existing) throw new Error(`createUser ${user.email}: ${error?.message ?? 'unknown error'}`);
  return existing.id;
}

async function main() {
  const ids: Record<string, string> = {};
  for (const user of USERS) {
    const id = await ensureUser(user);
    ids[user.email] = id;
    await must(
      `profile ${user.email}`,
      supabase
        .from('profiles')
        .update({
          neighborhood: user.neighborhood ?? null,
          ...(user.admin ? { role: 'admin' } : {}),
        })
        .eq('id', id),
    );
  }
  const denise = ids['denise.carter@example.com'];
  const marcus = ids['marcus.hill@example.com'];

  const existing = await must(
    'count reports',
    supabase.from('blight_reports').select('id').eq('reporter_id', denise).limit(1),
  );
  if (existing.length === 0) {
    const reports = await must(
      'insert reports',
      supabase
        .from('blight_reports')
        .insert(
          [
            {
              reporter_id: denise,
              category: 'vacant_lot',
              description: 'Overgrown lot with broken fence.',
              latitude: 33.7598,
              longitude: -84.4189,
              address: 'Vacant lot on Sunset Ave',
              status: 'reported_to_city',
              created_at: daysAgo(9),
              status_history: [
                { status: 'submitted', at: daysAgo(9) },
                { status: 'under_review', at: daysAgo(8) },
                { status: 'reported_to_city', at: daysAgo(6) },
              ],
            },
            {
              reporter_id: denise,
              category: 'illegal_dumping',
              description: 'Tires and a couch dumped behind the corner store.',
              latitude: 33.7625,
              longitude: -84.4211,
              address: 'Joseph E. Boone Blvd NW near Lindsay St',
              status: 'submitted',
            },
            {
              reporter_id: marcus,
              category: 'standing_water',
              description: 'Water pooling for a week after the rain.',
              latitude: 33.7561,
              longitude: -84.4142,
              address: 'Rhodes St NW',
              status: 'under_review',
              created_at: daysAgo(5),
              status_history: [
                { status: 'submitted', at: daysAgo(5) },
                { status: 'under_review', at: daysAgo(4) },
              ],
            },
          ],
          // Columns missing from a row take their defaults (not NULL) in this bulk insert.
          { defaultToNull: false },
        )
        .select('id'),
    );
    for (const report of reports) {
      const path = `${report.id}/demo-1.png`;
      await must(
        `upload ${path}`,
        supabase.storage
          .from('blight-photos')
          .upload(path, PNG, { contentType: 'image/png', upsert: true }),
      );
      await must(
        `photo row ${path}`,
        supabase
          .from('blight_report_photos')
          .upsert({ report_id: report.id, storage_path: path }, { onConflict: 'storage_path' }),
      );
    }
    console.log(`Created ${reports.length} blight reports.`);
  }

  await must(
    'reminder',
    supabase.from('event_reminders').upsert(
      {
        user_id: denise,
        event_id: eventId,
        event_title: eventTitle,
        event_starts_at: new Date(Date.now() + 3 * DAY).toISOString(),
      },
      { onConflict: 'user_id,event_id', ignoreDuplicates: true },
    ),
  );

  const inquiries = await must(
    'inquiries',
    supabase
      .from('housing_inquiries')
      .select('id')
      .eq('user_id', denise)
      .eq('housing_program_id', programId),
  );
  if (inquiries.length === 0) {
    await must(
      'inquiry',
      supabase.from('housing_inquiries').insert({
        user_id: denise,
        housing_program_id: programId,
        housing_program_title: programTitle,
        message: 'I am two months behind on rent after a hospital stay. Can you help?',
        preferred_contact: 'phone',
      }),
    );
  }

  console.log('Demo accounts (local only), password from DEMO_PASSWORD or the default:');
  for (const user of USERS) console.log(`  ${user.email}${user.admin ? ' (admin)' : ''}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
