/**
 * Published content from Sanity (alerts, events, housing, library, app text), or the bundled
 * demo content when no Sanity project is configured (src/lib/env.ts). Field names match
 * studio/schemaTypes and src/lib/api/types.ts.
 */
import * as demo from '@/lib/api/mock-data';
import type {
  Alert,
  AlertCategory,
  CommunityEvent,
  EventType,
  HousingCategory,
  HousingListing,
  HousingResource,
  LibraryCategory,
  LibraryResource,
} from '@/lib/api/types';
import { isDemoContent } from '@/lib/env';
import { portableTextToMarkdown, sanityQuery } from '@/lib/sanity';

/** Small artificial delay so demo mode exercises loading states. */
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function demoValue<T>(value: T): Promise<T> {
  await wait();
  // Deep copy so screens can't mutate the shared demo data by accident.
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------- alerts

const ALERT_FIELDS = `{
  "documentId": _id, title, message, category, issuer, body,
  "actionSteps": coalesce(actionSteps, []), affectedArea, sentAt, endsAt
}`;

const alertFilterCategories: Record<string, AlertCategory[]> = {
  emergency: ['emergency'],
  health: ['health_warning'],
  community: ['community_announcement', 'meeting_reminder'],
};

export type AlertFilter = 'all' | 'emergency' | 'health' | 'community';

export async function listAlerts(filter: AlertFilter = 'all'): Promise<Alert[]> {
  const categories = filter === 'all' ? null : alertFilterCategories[filter]!;
  if (isDemoContent) {
    return demoValue(demo.alerts.filter((a) => !categories || categories.includes(a.category)));
  }
  return sanityQuery<Alert[]>(
    `*[_type == "alert" && (!defined($categories) || category in $categories)]
      | order(sentAt desc)[0...50] ${ALERT_FIELDS}`,
    { categories },
  );
}

export async function getAlert(documentId: string): Promise<Alert> {
  if (isDemoContent) {
    const alert = demo.alerts.find((a) => a.documentId === documentId);
    if (!alert) throw new Error('Alert not found');
    return demoValue(alert);
  }
  const alert = await sanityQuery<Alert | null>(
    `*[_type == "alert" && _id == $id][0] ${ALERT_FIELDS}`,
    { id: documentId },
  );
  if (!alert) throw new Error('This alert is no longer available.');
  return alert;
}

// ---------------------------------------------------------------- events

const EVENT_FIELDS = `{
  "documentId": _id, title, description, startsAt, endsAt, eventType, locationName, address,
  neighborhood, costLabel, costNote
}`;

export async function listEvents(month: Date, types: EventType[] = []): Promise<CommunityEvent[]> {
  const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
  if (isDemoContent) {
    const items = demo.events
      .filter((e) => e.startsAt >= start && e.startsAt < end)
      .filter((e) => types.length === 0 || types.includes(e.eventType))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return demoValue(items);
  }
  return sanityQuery<CommunityEvent[]>(
    `*[_type == "event" && startsAt >= $start && startsAt < $end
        && (count($types) == 0 || eventType in $types)]
      | order(startsAt asc) ${EVENT_FIELDS}`,
    { start, end, types },
  );
}

/** Event content only. Reminder state comes from resident data (see ./resident). */
export async function getEventContent(documentId: string): Promise<CommunityEvent> {
  if (isDemoContent) {
    const event = demo.events.find((e) => e.documentId === documentId);
    if (!event) throw new Error('Event not found');
    return demoValue(event);
  }
  const event = await sanityQuery<CommunityEvent | null>(
    `*[_type == "event" && _id == $id][0] ${EVENT_FIELDS}`,
    { id: documentId },
  );
  if (!event) throw new Error('This event is no longer listed.');
  return event;
}

// ---------------------------------------------------------------- housing

const HOUSING_FIELDS = `{
  "documentId": _id, title, category, summary,
  "highlights": coalesce(highlights[]{value, label}, []),
  "eligibility": coalesce(eligibility, []),
  "requiredMaterials": coalesce(requiredMaterials, []),
  contactName, contactPhone, contactEmail, website,
  "acceptsInquiries": coalesce(acceptsInquiries, true),
  "inquiryAllowsAttachments": coalesce(inquiryAllowsAttachments, true)
}`;

export async function listHousingResources(category?: HousingCategory): Promise<HousingResource[]> {
  if (isDemoContent) {
    return demoValue(demo.housingResources.filter((r) => !category || r.category === category));
  }
  return sanityQuery<HousingResource[]>(
    `*[_type == "housingProgram" && (!defined($category) || category == $category)]
      | order(title asc) ${HOUSING_FIELDS}`,
    { category: category ?? null },
  );
}

export async function getHousingResource(documentId: string): Promise<HousingResource> {
  if (isDemoContent) {
    const item = demo.housingResources.find((r) => r.documentId === documentId);
    if (!item) throw new Error('Program not found');
    return demoValue(item);
  }
  const item = await sanityQuery<HousingResource | null>(
    `*[_type == "housingProgram" && _id == $id][0] ${HOUSING_FIELDS}`,
    { id: documentId },
  );
  if (!item) throw new Error('This program is no longer listed.');
  return item;
}

export async function listHousingListings(): Promise<HousingListing[]> {
  if (isDemoContent) return demoValue(demo.housingListings);
  return sanityQuery<HousingListing[]>(
    `*[_type == "housingListing"] | order(_createdAt desc) {
      "documentId": _id, title, address, neighborhood, rentLabel, bedrooms,
      "imageUrl": image.asset->url, url, availableFrom
    }`,
  );
}

// ---------------------------------------------------------------- library

const LIBRARY_FIELDS = `{
  "documentId": _id, title, description, category, resourceType, url, body, source,
  durationMinutes, "featured": coalesce(featured, false)
}`;

type LibraryRow = Omit<LibraryResource, 'body'> & {
  body: Parameters<typeof portableTextToMarkdown>[0];
};

const fromLibraryRow = (row: LibraryRow): LibraryResource => ({
  ...row,
  body: portableTextToMarkdown(row.body),
});

export async function listLibrary(
  category?: LibraryCategory,
  search?: string,
): Promise<LibraryResource[]> {
  const q = search?.trim();
  if (isDemoContent) {
    const needle = q?.toLowerCase();
    const items = demo.libraryResources
      .filter((r) => !category || r.category === category)
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.description.toLowerCase().includes(needle),
      );
    return demoValue(items);
  }
  const rows = await sanityQuery<LibraryRow[]>(
    `*[_type == "libraryResource"
        && (!defined($category) || category == $category)
        && (!defined($q) || [title, description] match ($q + "*"))]
      | order(featured desc, title asc) ${LIBRARY_FIELDS}`,
    { category: category ?? null, q: q || null },
  );
  return rows.map(fromLibraryRow);
}

export async function getLibraryResource(documentId: string): Promise<LibraryResource> {
  if (isDemoContent) {
    const item = demo.libraryResources.find((r) => r.documentId === documentId);
    if (!item) throw new Error('Resource not found');
    return demoValue(item);
  }
  const row = await sanityQuery<LibraryRow | null>(
    `*[_type == "libraryResource" && _id == $id][0] ${LIBRARY_FIELDS}`,
    { id: documentId },
  );
  if (!row) throw new Error('This item is no longer in the library.');
  return fromLibraryRow(row);
}

// ---------------------------------------------------------------- app text

/** Editable app text (Sanity singleton "appCopy"). Missing fields fall back in useAppCopy. */
export type AppCopy = Partial<{
  welcomeTagline: string;
  evictionBannerTitle: string;
  evictionBannerBody: string;
  inquiryConfirmation: string;
  reportingSteps: string[];
  emergencyNotice: string;
  airQualityExplainer: string;
  waterQualityExplainer: string;
  heatExplainer: string;
  mosquitoExplainer: string;
  heatMapNote: string;
}>;

export async function getAppCopy(): Promise<AppCopy> {
  if (isDemoContent) return {};
  const copy = await sanityQuery<AppCopy | null>(`*[_id == "appCopy"][0]`);
  return copy ?? {};
}
