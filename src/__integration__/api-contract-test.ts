/**
 * Contract test: runs the app's real data layer (src/lib/api) against the hosted Sanity
 * dataset and Supabase dev project (decision D-026), and checks every response has the
 * shape src/lib/api/types.ts promises. Not part of `npm test`; run `npm run test:contract`.
 *
 * Needs the EXPO_PUBLIC_SANITY_* and EXPO_PUBLIC_SUPABASE_* values in .env, plus
 * CONTRACT_TEST_EMAIL / CONTRACT_TEST_PASSWORD for a test account (created on first run).
 * Writes data each run: a reminder (removed again), an inquiry, a blight report with a photo.
 */
import fs from 'fs';
import path from 'path';

import * as api from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { fromReportRow } from '@/lib/api/resident';
import type { Profile } from '@/lib/api/types';
import { isDemoAuth, isDemoContent } from '@/lib/env';
import { supabase } from '@/lib/supabase';

jest.setTimeout(60_000);

const email = process.env.CONTRACT_TEST_EMAIL ?? '';
const password = process.env.CONTRACT_TEST_PASSWORD ?? '';

type Kind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'string|null'
  | 'number|null'
  | 'object|null'
  | 'array|null';

/** Fail with a readable message when a field is missing or has the wrong type. */
function expectShape(label: string, value: unknown, shape: Record<string, Kind>) {
  expect(value).toEqual(expect.any(Object));
  const record = value as Record<string, unknown>;
  for (const [key, kind] of Object.entries(shape)) {
    const v = record[key];
    const actual = v === null || v === undefined ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    if (!kind.split('|').includes(actual)) {
      throw new Error(`${label}.${key}: expected ${kind}, got ${actual} (${JSON.stringify(v)})`);
    }
  }
}

// prettier-ignore
const shapes = {
  alert: { documentId: 'string', title: 'string', message: 'string', category: 'string', issuer: 'string|null', body: 'string|null', actionSteps: 'array', affectedArea: 'string|null', sentAt: 'string', endsAt: 'string|null' },
  event: { documentId: 'string', title: 'string', description: 'string', startsAt: 'string', endsAt: 'string', eventType: 'string', locationName: 'string|null', address: 'string|null', costLabel: 'string|null', costNote: 'string|null' },
  housing: { documentId: 'string', title: 'string', category: 'string', summary: 'string', highlights: 'array', eligibility: 'array', requiredMaterials: 'array', contactPhone: 'string|null', acceptsInquiries: 'boolean', inquiryAllowsAttachments: 'boolean' },
  listing: { documentId: 'string', title: 'string', address: 'string', rentLabel: 'string|null', bedrooms: 'number|null', imageUrl: 'string|null' },
  library: { documentId: 'string', title: 'string', description: 'string', category: 'string', resourceType: 'string', url: 'string|null', body: 'string|null', source: 'string|null', durationMinutes: 'number|null', featured: 'boolean' },
  reading: { category: 'string', value: 'number|null', unit: 'string|null', level: 'string', summary: 'string', observedAt: 'string|null', source: 'string|null', stale: 'boolean' },
  glance: { temperatureF: 'number|null', conditions: 'string|null', highF: 'number|null', lowF: 'number|null', airQuality: 'object|null', activeAlerts: 'number', hourly: 'array', updatedAt: 'string|null' },
  profile: { documentId: 'string', fullName: 'string', email: 'string|null', phone: 'string|null', role: 'string', status: 'string', neighborhood: 'string|null', textSize: 'string', language: 'string', notificationPreferences: 'object' },
  report: { id: 'number', documentId: 'string', category: 'string', latitude: 'number', longitude: 'number', status: 'string', statusHistory: 'array', imageUrls: 'array', createdAt: 'string' },
} satisfies Record<string, Record<string, Kind>>;

beforeAll(() => {
  // Guard against silently testing the bundled demo data.
  expect({ isDemoContent, isDemoAuth }).toEqual({ isDemoContent: false, isDemoAuth: false });
});

describe('content from Sanity (guest)', () => {
  beforeAll(async () => {
    await supabase!.auth.signOut();
  });

  it('alerts', async () => {
    const alerts = await api.listAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    alerts.forEach((a) => expectShape('alert', a, shapes.alert));
    expectShape('alert detail', await api.getAlert(alerts[0]!.documentId), shapes.alert);
    const emergency = await api.listAlerts('emergency');
    expect(emergency.every((a) => a.category === 'emergency')).toBe(true);
  });

  it('events for this month and next, with type filter', async () => {
    const now = new Date();
    const events = [
      ...(await api.listEvents(now)),
      ...(await api.listEvents(new Date(now.getFullYear(), now.getMonth() + 1, 1))),
    ];
    expect(events.length).toBeGreaterThan(0);
    events.forEach((e) => expectShape('event', e, shapes.event));
    const wellness = await api.listEvents(now, ['wellness']);
    expect(wellness.every((e) => e.eventType === 'wellness')).toBe(true);
    const detail = await api.getEvent(events[0]!.documentId);
    expectShape('event detail', detail, shapes.event);
    expect(detail.hasReminder).toBe(false);
  });

  it('housing programs and listings', async () => {
    const programs = await api.listHousingResources();
    expect(programs.length).toBeGreaterThan(0);
    programs.forEach((p) => expectShape('housing', p, shapes.housing));
    const rental = await api.listHousingResources('rental_assistance');
    expect(rental.length).toBeGreaterThan(0);
    expect(rental.every((p) => p.category === 'rental_assistance')).toBe(true);
    expectShape(
      'housing detail',
      await api.getHousingResource(programs[0]!.documentId),
      shapes.housing,
    );
    (await api.listHousingListings()).forEach((l) => expectShape('listing', l, shapes.listing));
  });

  it('library with category filter, search and article body', async () => {
    const all = await api.listLibrary();
    expect(all.length).toBeGreaterThan(0);
    all.forEach((r) => expectShape('library', r, shapes.library));
    expect((await api.listLibrary('health')).every((r) => r.category === 'health')).toBe(true);
    const search = await api.listLibrary(undefined, 'heat');
    expect(search.some((r) => /heat/i.test(r.title))).toBe(true);
    const article = all.find((r) => r.body);
    expect(article?.body).toMatch(/(^|\n)## /); // Portable Text h2 → "## "
  });

  it('app text document exists', async () => {
    expect(await api.getAppCopy()).toEqual(expect.any(Object));
  });
});

describe('Supabase as a guest', () => {
  it('environment readings and glance', async () => {
    const readings = await api.getEnvironment();
    readings.forEach((r) => expectShape('reading', r, shapes.reading));
    expect(readings.map((r) => r.category).sort()).toEqual([
      'air_quality',
      'heat',
      'mosquito',
      'temperature',
      'water_quality',
    ]);
    expectShape('glance', await api.getEnvironmentGlance(), shapes.glance);
  });

  it('public blight reports never expose the reporter', async () => {
    const { data, error } = await supabase!.from('public_blight_reports').select('*').limit(5);
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row).not.toHaveProperty('reporter_id');
      expect(row).not.toHaveProperty('keep_name_private');
      expect(row).not.toHaveProperty('resolution_note');
    }
  });

  it('can register a push token without an account', async () => {
    await api.registerPushToken('ExponentPushToken[contract-test-guest]', 'ios');
  });

  it('has no profile', async () => {
    const error = await api.getMe().catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });
});

describe('Supabase as a signed-in resident', () => {
  let me: Profile;

  beforeAll(async () => {
    expect(email && password).toBeTruthy();
    const signIn = await supabase!.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      const signUp = await supabase!.auth.signUp({
        email,
        password,
        options: { data: { full_name: 'Contract Test', phone: '+14045550199' } },
      });
      if (signUp.error) throw signUp.error;
      expect(signUp.data.session).toBeTruthy(); // email confirmation must be off in dev
    }
  });

  afterAll(async () => {
    await supabase!.auth.signOut();
  });

  it('reads and updates its own profile', async () => {
    me = await api.getMe();
    expectShape('profile', me, shapes.profile);
    expect(me.email).toBe(email.toLowerCase());
    expect(me.role).toBe('resident');
    const flipped = !me.notificationPreferences.meetingReminders;
    const updated = await api.updateMe({ notificationPreferences: { meetingReminders: flipped } });
    expect(updated.notificationPreferences.meetingReminders).toBe(flipped);
  });

  it('cannot make itself an admin', async () => {
    const { error } = await supabase!
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', me.documentId);
    expect(error).not.toBeNull();
    expect((await api.getMe()).role).toBe('resident');
  });

  it('sets and removes an event reminder', async () => {
    const now = new Date();
    const [event] = await api.listEvents(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    expect(event).toBeTruthy();
    let detail = await api.getEvent(event!.documentId);
    if (detail.hasReminder) await api.removeReminder(event!.documentId, detail.reminderId!);
    await api.setReminder(event!);
    detail = await api.getEvent(event!.documentId);
    expect(detail.hasReminder).toBe(true);
    expect(typeof detail.reminderId).toBe('string');
    await api.removeReminder(event!.documentId, detail.reminderId!);
    expect((await api.getEvent(event!.documentId)).hasReminder).toBe(false);
  });

  it('sends a housing inquiry', async () => {
    const [program] = await api.listHousingResources('rental_assistance');
    await api.createHousingInquiry({
      housingResource: program!.documentId,
      programTitle: program!.title,
      message: 'Contract test inquiry. Please ignore.',
      preferredContact: 'email',
    });
  });

  it('submits a blight report with a photo and sees it in My reports', async () => {
    // The app re-encodes photos with a native module; here we upload a prepared JPEG through
    // the same tables and bucket the app uses.
    const { data: report, error } = await supabase!
      .from('blight_reports')
      .insert({
        category: 'other',
        description: 'Contract test report. Please ignore.',
        latitude: 33.7601,
        longitude: -84.4231,
        address: 'Contract test',
        keep_name_private: true,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const photo = fs.readFileSync(path.resolve(__dirname, '../../assets/maps/report-location.jpg'));
    const storagePath = `${report!.id}/contract-test.jpg`;
    const upload = await supabase!.storage
      .from('blight-photos')
      .upload(storagePath, photo, { contentType: 'image/jpeg' });
    expect(upload.error).toBeNull();
    const attach = await supabase!
      .from('blight_report_photos')
      .insert({ report_id: report!.id, storage_path: storagePath });
    expect(attach.error).toBeNull();

    const mine = await api.listMyReports();
    mine.forEach((r) => expectShape('my report', r, shapes.report));
    const created = mine.find((r) => r.id === report!.id);
    expect(created?.status).toBe('submitted');
    expect(created?.imageUrls).toHaveLength(1);

    // The photo is publicly readable and the report shows on the public view.
    const image = await fetch(created!.imageUrls[0]!);
    expect(image.status).toBe(200);
    const { data: pub } = await supabase!
      .from('public_blight_reports')
      .select('*')
      .eq('id', report!.id);
    expect(pub).toHaveLength(1);
    expect(fromReportRow(pub![0]).imageUrls).toHaveLength(1);
  });

  it('links its push token to the account', async () => {
    await api.registerPushToken('ExponentPushToken[contract-test-guest]', 'ios');
  });

  it('is refused admin functions', async () => {
    const { error } = await supabase!.rpc('admin_summary');
    expect(error).not.toBeNull();
  });
});
