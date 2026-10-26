/**
 * Resident data in Supabase (profiles, reminders, inquiries, blight reports, push tokens,
 * environment readings). Every call runs as the signed-in user and is checked by Row Level
 * Security (docs/security.md, supabase/migrations). Without Supabase configured, an
 * on-device simulation stands in (demo mode, src/lib/env.ts).
 *
 * Column names follow the database (snake_case); this module maps them to the app types.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { ApiError } from '@/lib/api/client';
import { demoValue, getEventContent } from '@/lib/api/content';
import * as demo from '@/lib/api/mock-data';
import type {
  BlightReport,
  BlightReportInput,
  CommunityEvent,
  EnvironmentGlance,
  EnvironmentReading,
  HousingInquiryInput,
  Profile,
  ProfileUpdate,
} from '@/lib/api/types';
import { isDemoAuth } from '@/lib/env';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------- helpers

type PgError = { code?: string; message: string; details?: string | null };

/** PostgREST/Postgres errors → ApiError with the HTTP-like status the app expects. */
export function toApiError(error: PgError): ApiError {
  const status =
    error.code === '42501'
      ? 403
      : error.code === 'PGRST116' || error.code === 'P0002'
        ? 404
        : error.code === '23505'
          ? 409
          : error.code && /^(22|23|P0001)/.test(error.code)
            ? 400
            : 500;
  return new ApiError(status, error.code ?? 'DatabaseError', error.message, error.details);
}

/** Unwrap a supabase-js result; on success `data` is present (single() errors when missing). */
function check<T>(result: { data: T; error: PgError | null }): NonNullable<T> {
  if (result.error) throw toApiError(result.error);
  return result.data as NonNullable<T>;
}

function db() {
  if (!supabase) throw new ApiError(500, 'NotConfigured', 'Supabase is not configured.');
  return supabase;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new ApiError(401, 'Unauthorized', 'Sign in to do this.');
  return id;
}

// ---------------------------------------------------------------- demo state

// Mutable demo state for things a demo user can change on the device.
let demoProfileState: Profile = { ...demo.demoProfile };
const demoReminders = new Map<string, string>();
const demoReports: BlightReport[] = [...demo.myReports];

/** Demo-only: reset the on-device demo profile (e.g. when the demo user signs in again). */
export function resetDemoProfile(fullName?: string, email?: string) {
  demoProfileState = {
    ...demo.demoProfile,
    ...(fullName ? { fullName } : null),
    ...(email ? { email } : null),
  };
}

// ---------------------------------------------------------------- profile

const PROFILE_COLUMNS =
  'id, full_name, email, phone, role, status, suspended_until, neighborhood, text_size, language, notif_health_warnings, notif_community_announcements, notif_meeting_reminders';

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Profile['role'];
  status: Profile['status'];
  suspended_until: string | null;
  neighborhood: Profile['neighborhood'];
  text_size: Profile['textSize'];
  language: Profile['language'];
  notif_health_warnings: boolean;
  notif_community_announcements: boolean;
  notif_meeting_reminders: boolean;
};

const fromProfileRow = (r: ProfileRow): Profile => ({
  documentId: r.id,
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  role: r.role,
  status: r.status,
  suspendedUntil: r.suspended_until,
  neighborhood: r.neighborhood,
  textSize: r.text_size,
  language: r.language,
  notificationPreferences: {
    healthWarnings: r.notif_health_warnings,
    communityAnnouncements: r.notif_community_announcements,
    meetingReminders: r.notif_meeting_reminders,
  },
});

export async function getMe(): Promise<Profile> {
  if (isDemoAuth) return demoValue(demoProfileState);
  const id = await requireUserId();
  const row = check(
    await db().from('profiles').select(PROFILE_COLUMNS).eq('id', id).single<ProfileRow>(),
  );
  return fromProfileRow(row);
}

export async function updateMe(update: ProfileUpdate): Promise<Profile> {
  if (isDemoAuth) {
    demoProfileState = {
      ...demoProfileState,
      ...update,
      notificationPreferences: {
        ...demoProfileState.notificationPreferences,
        ...update.notificationPreferences,
      },
    };
    return demoValue(demoProfileState);
  }
  const id = await requireUserId();
  const prefs = update.notificationPreferences ?? {};
  const patch: Record<string, unknown> = {
    full_name: update.fullName,
    phone: update.phone,
    neighborhood: update.neighborhood,
    text_size: update.textSize,
    language: update.language,
    notif_health_warnings: prefs.healthWarnings,
    notif_community_announcements: prefs.communityAnnouncements,
    notif_meeting_reminders: prefs.meetingReminders,
  };
  // Only send what changed; the database rejects columns residents may not edit.
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete patch[key];
  const row = check(
    await db()
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .single<ProfileRow>(),
  );
  return fromProfileRow(row);
}

/** Record activity for admins' "last seen" (best-effort; ignored in demo mode). */
export async function touchLastSeen() {
  if (isDemoAuth || !(await currentUserId())) return;
  await db().rpc('touch_last_seen');
}

// ---------------------------------------------------------------- event reminders

/** Event content from Sanity plus whether the signed-in user set a reminder. */
export async function getEvent(documentId: string): Promise<CommunityEvent> {
  const event = await getEventContent(documentId);
  if (isDemoAuth) {
    const reminderId = demoReminders.get(documentId) ?? null;
    return { ...event, hasReminder: Boolean(reminderId), reminderId };
  }
  const userId = await currentUserId();
  if (!userId) return { ...event, hasReminder: false, reminderId: null };
  const rows = check(
    await db()
      .from('event_reminders')
      .select('id')
      .eq('user_id', userId)
      .eq('event_id', documentId)
      .limit(1),
  ) as { id: string }[];
  return { ...event, hasReminder: rows.length > 0, reminderId: rows[0]?.id ?? null };
}

export async function setReminder(
  event: Pick<CommunityEvent, 'documentId' | 'title' | 'startsAt'>,
) {
  if (isDemoAuth) {
    demoReminders.set(event.documentId, `reminder-${event.documentId}`);
    return demoValue(undefined);
  }
  await requireUserId();
  check(
    await db().from('event_reminders').insert({
      event_id: event.documentId,
      event_title: event.title,
      event_starts_at: event.startsAt,
    }),
  );
}

export async function removeReminder(eventId: string, reminderId: string) {
  if (isDemoAuth) {
    demoReminders.delete(eventId);
    return demoValue(undefined);
  }
  check(await db().from('event_reminders').delete().eq('id', reminderId));
}

// ---------------------------------------------------------------- housing inquiries

export async function createHousingInquiry(input: HousingInquiryInput & { programTitle: string }) {
  if (isDemoAuth) return demoValue(undefined);
  await requireUserId();
  check(
    await db().from('housing_inquiries').insert({
      housing_program_id: input.housingResource,
      housing_program_title: input.programTitle,
      message: input.message,
      preferred_contact: input.preferredContact,
    }),
  );
}

// ---------------------------------------------------------------- blight reports

const REPORT_COLUMNS =
  'id, category, description, latitude, longitude, address, status, status_history, created_at, blight_report_photos(storage_path)';

type ReportRow = {
  id: number;
  category: BlightReport['category'];
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  status: BlightReport['status'];
  status_history: BlightReport['statusHistory'] | null;
  created_at: string;
  blight_report_photos?: { storage_path: string }[];
  photo_paths?: string[] | null;
};

export function photoUrl(path: string): string {
  return db().storage.from('blight-photos').getPublicUrl(path).data.publicUrl;
}

export const fromReportRow = (r: ReportRow): BlightReport => ({
  documentId: String(r.id),
  id: Number(r.id),
  category: r.category,
  description: r.description,
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
  address: r.address,
  status: r.status,
  statusHistory: r.status_history ?? [],
  imageUrls: (r.photo_paths ?? r.blight_report_photos?.map((p) => p.storage_path) ?? []).map(
    photoUrl,
  ),
  createdAt: r.created_at,
});

export async function listMyReports(): Promise<BlightReport[]> {
  if (isDemoAuth) {
    return demoValue([...demoReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  const userId = await requireUserId();
  const rows = check(
    await db()
      .from('blight_reports')
      .select(REPORT_COLUMNS)
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false }),
  ) as ReportRow[];
  return rows.map(fromReportRow);
}

/**
 * Re-encode to JPEG (≤1600 px). This strips EXIF, including GPS, before anything is uploaded
 * to the public photo bucket (docs/security.md, File uploads).
 */
async function prepareJpeg(uri: string): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri).resize({ width: 1600 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const response = await fetch(saved.uri);
  return response.arrayBuffer();
}

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function createBlightReport(input: BlightReportInput): Promise<BlightReport> {
  if (input.photos.length < 1) {
    throw new ApiError(400, 'ValidationError', 'Add at least one photo.');
  }
  if (isDemoAuth) {
    await demoValue(undefined);
    const created: BlightReport = {
      documentId: `report-${Date.now()}`,
      id: 1042 + demoReports.length - demo.myReports.length,
      category: input.category,
      description: input.description || null,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      status: 'submitted',
      statusHistory: [{ status: 'submitted', at: new Date().toISOString() }],
      imageUrls: input.photos.map((p) => p.uri),
      createdAt: new Date().toISOString(),
    };
    demoReports.push(created);
    return created;
  }

  await requireUserId();
  const report = check(
    await db()
      .from('blight_reports')
      .insert({
        category: input.category,
        description: input.description || null,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address,
        keep_name_private: input.keepNamePrivate,
      })
      .select('id')
      .single<{ id: number }>(),
  );

  // Photos: path is {report_id}/{random}.jpg (no user id in the public URL).
  for (const photo of input.photos) {
    const body = await prepareJpeg(photo.uri);
    const path = `${report.id}/${randomId()}.jpg`;
    const upload = await db()
      .storage.from('blight-photos')
      .upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (upload.error) throw new ApiError(400, 'UploadError', upload.error.message);
    check(
      await db().from('blight_report_photos').insert({ report_id: report.id, storage_path: path }),
    );
  }

  const row = check(
    await db()
      .from('blight_reports')
      .select(REPORT_COLUMNS)
      .eq('id', report.id)
      .single<ReportRow>(),
  );
  return fromReportRow(row);
}

/** Same category within 50 m in the last 30 days (warning only; Q-013). */
export async function findNearbyReports(
  category: BlightReport['category'],
  latitude: number,
  longitude: number,
): Promise<{ id: number; status: BlightReport['status'] }[]> {
  if (isDemoAuth) return [];
  return check(
    await db().rpc('nearby_blight_reports', {
      p_category: category,
      p_lat: latitude,
      p_lng: longitude,
    }),
  ) as { id: number; status: BlightReport['status'] }[];
}

// ---------------------------------------------------------------- environment

export async function getEnvironment(lat?: number, lng?: number): Promise<EnvironmentReading[]> {
  if (isDemoAuth) return demoValue(demo.environmentReadings);
  return check(
    await db().rpc('environment_latest', { p_lat: lat ?? null, p_lng: lng ?? null }),
  ) as EnvironmentReading[];
}

export async function getEnvironmentGlance(): Promise<EnvironmentGlance> {
  if (isDemoAuth) return demoValue(demo.environmentGlance);
  return check(await db().rpc('environment_glance')) as EnvironmentGlance;
}

// ---------------------------------------------------------------- push

/** Links this device's token to the signed-in user, or to nobody for guests (Q-005). */
export async function registerPushToken(token: string, platform: 'ios' | 'android') {
  if (isDemoAuth) return;
  check(await db().rpc('register_push_token', { p_token: token, p_platform: platform }));
}
