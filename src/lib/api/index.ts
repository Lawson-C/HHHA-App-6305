/**
 * Data access for every screen. Each function talks to Strapi when EXPO_PUBLIC_API_URL is
 * set, and otherwise serves the bundled demo content (see src/lib/env.ts).
 * Screens use these through the React Query hooks in `./queries`.
 */
import { absoluteUrl, apiRequest } from '@/lib/api/client';
import * as demo from '@/lib/api/mock-data';
import type {
  Alert,
  AlertCategory,
  BlightReport,
  BlightReportInput,
  CommunityEvent,
  EnvironmentGlance,
  EnvironmentReading,
  EventType,
  HousingCategory,
  HousingInquiryInput,
  HousingListing,
  HousingResource,
  LibraryCategory,
  LibraryResource,
  Profile,
  ProfileUpdate,
} from '@/lib/api/types';
import { isDemoData } from '@/lib/env';

type One<T> = { data: T };
type Many<T> = { data: T[]; meta?: unknown };

/** Small artificial delay so demo mode exercises loading states. */
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function demoValue<T>(value: T): Promise<T> {
  await wait();
  // Deep copy so screens can't mutate the shared demo data by accident.
  return JSON.parse(JSON.stringify(value)) as T;
}

// Mutable demo state for things a demo user can change on the device.
let demoProfileState: Profile = { ...demo.demoProfile };
const demoReminders = new Map<string, string>();
const demoReports: BlightReport[] = [...demo.myReports];

// ---------------------------------------------------------------- profile

export async function getMe(token?: string | null): Promise<Profile> {
  if (isDemoData) return demoValue(demoProfileState);
  const res = await apiRequest<One<Profile>>('/me', { token });
  return res.data;
}

export async function updateMe(update: ProfileUpdate): Promise<Profile> {
  if (isDemoData) {
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
  const res = await apiRequest<One<Profile>>('/me', { method: 'PUT', body: update });
  return res.data;
}

/** Demo-only: reset the on-device demo profile (e.g. when the demo user signs out). */
export function resetDemoProfile(fullName?: string, email?: string) {
  demoProfileState = {
    ...demo.demoProfile,
    ...(fullName ? { fullName } : null),
    ...(email ? { email } : null),
  };
}

// ---------------------------------------------------------------- alerts

const alertFilterCategories: Record<string, AlertCategory[]> = {
  emergency: ['emergency'],
  health: ['health_warning'],
  community: ['community_announcement', 'meeting_reminder'],
};

export type AlertFilter = 'all' | 'emergency' | 'health' | 'community';

export async function listAlerts(filter: AlertFilter = 'all'): Promise<Alert[]> {
  const categories = filter === 'all' ? null : alertFilterCategories[filter];
  if (isDemoData) {
    const items = demo.alerts.filter((a) => !categories || categories.includes(a.category));
    return demoValue(items);
  }
  const query: Record<string, string> = { sort: 'sentAt:desc', 'pagination[pageSize]': '50' };
  categories?.forEach((c, i) => (query[`filters[category][$in][${i}]`] = c));
  const res = await apiRequest<Many<Alert>>('/notifications', { query });
  return res.data;
}

export async function getAlert(documentId: string): Promise<Alert> {
  if (isDemoData) {
    const alert = demo.alerts.find((a) => a.documentId === documentId);
    if (!alert) throw new Error('Alert not found');
    return demoValue(alert);
  }
  const res = await apiRequest<One<Alert>>(`/notifications/${documentId}`);
  return res.data;
}

// ---------------------------------------------------------------- events

export async function listEvents(month: Date, types: EventType[] = []): Promise<CommunityEvent[]> {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  if (isDemoData) {
    const items = demo.events
      .filter((e) => {
        const t = new Date(e.startsAt).getTime();
        return t >= start.getTime() && t < end.getTime();
      })
      .filter((e) => types.length === 0 || types.includes(e.eventType))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return demoValue(items);
  }
  const query: Record<string, string> = {
    'filters[startsAt][$gte]': start.toISOString(),
    'filters[startsAt][$lt]': end.toISOString(),
    sort: 'startsAt:asc',
    'pagination[pageSize]': '100',
  };
  types.forEach((t, i) => (query[`filters[eventType][$in][${i}]`] = t));
  const res = await apiRequest<Many<CommunityEvent>>('/events', { query });
  return res.data;
}

export async function getEvent(documentId: string): Promise<CommunityEvent> {
  if (isDemoData) {
    const event = demo.events.find((e) => e.documentId === documentId);
    if (!event) throw new Error('Event not found');
    const reminderId = demoReminders.get(documentId) ?? null;
    return demoValue({ ...event, hasReminder: Boolean(reminderId), reminderId });
  }
  const res = await apiRequest<One<CommunityEvent>>(`/events/${documentId}`);
  return res.data;
}

export async function setReminder(eventId: string): Promise<{ documentId: string }> {
  if (isDemoData) {
    const id = `reminder-${eventId}`;
    demoReminders.set(eventId, id);
    return demoValue({ documentId: id });
  }
  const res = await apiRequest<One<{ documentId: string }>>('/event-reminders', {
    method: 'POST',
    body: { event: eventId },
  });
  return res.data;
}

export async function removeReminder(eventId: string, reminderId: string): Promise<void> {
  if (isDemoData) {
    demoReminders.delete(eventId);
    await wait();
    return;
  }
  await apiRequest(`/event-reminders/${reminderId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- housing

export async function listHousingResources(category?: HousingCategory): Promise<HousingResource[]> {
  if (isDemoData) {
    return demoValue(demo.housingResources.filter((r) => !category || r.category === category));
  }
  const res = await apiRequest<Many<HousingResource>>('/housing-resources', {
    query: { 'filters[category][$eq]': category, sort: 'title:asc' },
  });
  return res.data;
}

export async function getHousingResource(documentId: string): Promise<HousingResource> {
  if (isDemoData) {
    const item = demo.housingResources.find((r) => r.documentId === documentId);
    if (!item) throw new Error('Program not found');
    return demoValue(item);
  }
  const res = await apiRequest<One<HousingResource>>(`/housing-resources/${documentId}`);
  return res.data;
}

export async function listHousingListings(): Promise<HousingListing[]> {
  if (isDemoData) return demoValue(demo.housingListings);
  const res = await apiRequest<Many<HousingListing>>('/housing-listings', {
    query: { sort: 'createdAt:desc' },
  });
  return res.data.map((l) => ({ ...l, imageUrl: absoluteUrl(l.imageUrl) }));
}

export async function createHousingInquiry(input: HousingInquiryInput): Promise<void> {
  if (isDemoData) {
    await wait(600);
    return;
  }
  await apiRequest('/housing-inquiries', { method: 'POST', body: input });
}

// ---------------------------------------------------------------- library

export async function listLibrary(
  category?: LibraryCategory,
  search?: string,
): Promise<LibraryResource[]> {
  const q = search?.trim().toLowerCase();
  if (isDemoData) {
    const items = demo.libraryResources
      .filter((r) => !category || r.category === category)
      .filter(
        (r) => !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    return demoValue(items);
  }
  const res = await apiRequest<Many<LibraryResource>>('/library-resources', {
    query: {
      'filters[category][$eq]': category,
      'filters[$or][0][title][$containsi]': q,
      'filters[$or][1][description][$containsi]': q,
      sort: 'title:asc',
      'pagination[pageSize]': '100',
    },
  });
  return res.data;
}

export async function getLibraryResource(documentId: string): Promise<LibraryResource> {
  if (isDemoData) {
    const item = demo.libraryResources.find((r) => r.documentId === documentId);
    if (!item) throw new Error('Resource not found');
    return demoValue(item);
  }
  const res = await apiRequest<One<LibraryResource>>(`/library-resources/${documentId}`);
  return res.data;
}

// ---------------------------------------------------------------- environment

export async function getEnvironment(lat?: number, lng?: number): Promise<EnvironmentReading[]> {
  if (isDemoData) return demoValue(demo.environmentReadings);
  const res = await apiRequest<Many<EnvironmentReading>>('/environment', { query: { lat, lng } });
  return res.data;
}

export async function getEnvironmentGlance(): Promise<EnvironmentGlance> {
  if (isDemoData) return demoValue(demo.environmentGlance);
  const res = await apiRequest<One<EnvironmentGlance>>('/environment/glance');
  return res.data;
}

// ---------------------------------------------------------------- blight reports

export async function listMyReports(): Promise<BlightReport[]> {
  if (isDemoData) {
    return demoValue([...demoReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  const res = await apiRequest<Many<BlightReport>>('/blight-reports/mine');
  return res.data.map((r) => ({ ...r, imageUrls: r.imageUrls.map((u) => absoluteUrl(u) ?? u) }));
}

export async function createBlightReport(input: BlightReportInput): Promise<BlightReport> {
  if (isDemoData) {
    await wait(800);
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

  const form = new FormData();
  const { photos, ...data } = input;
  form.append('data', JSON.stringify(data));
  photos.forEach((photo, i) => {
    // React Native's FormData accepts { uri, name, type } file descriptors.
    form.append('files.images', {
      uri: photo.uri,
      name: photo.fileName ?? `photo-${i + 1}.jpg`,
      type: photo.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  });
  const res = await apiRequest<One<BlightReport>>('/blight-reports', { method: 'POST', form });
  return res.data;
}

// ---------------------------------------------------------------- push

export async function registerPushToken(token: string, platform: 'ios' | 'android') {
  if (isDemoData) return;
  await apiRequest('/push-tokens', { method: 'POST', body: { token, platform } });
}
