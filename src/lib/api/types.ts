/**
 * App-side types for the Strapi REST API. Field names and enum values match
 * docs/data-model.md exactly. Strapi 5 responses are flat and keyed by `documentId`.
 */

export type Role = 'resident' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type TextSize = 'default' | 'large' | 'extra_large';

export type Neighborhood =
  | 'english_avenue'
  | 'vine_city'
  | 'hunter_hills'
  | 'washington_park'
  | 'bankhead'
  | 'knight_park'
  | 'dixie_hills'
  | 'west_lake'
  | 'center_hill'
  | 'harvel_homes'
  | 'georgia_tech';

export type NotificationPreferences = {
  healthWarnings: boolean;
  communityAnnouncements: boolean;
  meetingReminders: boolean;
};

export type Profile = {
  documentId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: AccountStatus;
  suspendedUntil: string | null;
  neighborhood: Neighborhood | null;
  textSize: TextSize;
  language: 'en' | 'es';
  notificationPreferences: NotificationPreferences;
};

export type ProfileUpdate = Partial<
  Pick<Profile, 'fullName' | 'phone' | 'neighborhood' | 'textSize' | 'language'> & {
    notificationPreferences: Partial<NotificationPreferences>;
  }
>;

export type AlertCategory =
  'emergency' | 'health_warning' | 'community_announcement' | 'meeting_reminder';

/** A sent `notification` record, shown in the app as an "alert". */
export type Alert = {
  documentId: string;
  title: string;
  message: string;
  category: AlertCategory;
  issuer: string | null;
  body: string | null;
  actionSteps: string[];
  affectedArea: string | null;
  sentAt: string;
  endsAt: string | null;
};

export type EventType =
  | 'workforce_development'
  | 'financial_literacy'
  | 'wellness'
  | 'civic_meeting'
  | 'community_gathering'
  | 'other';

export type CommunityEvent = {
  documentId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  eventType: EventType;
  locationName: string | null;
  address: string | null;
  neighborhood: string | null;
  costLabel: string | null;
  costNote: string | null;
  /** Present only on detail responses for signed-in users. */
  hasReminder?: boolean;
  reminderId?: string | null;
};

export type HousingCategory =
  | 'rental_assistance'
  | 'eviction_prevention'
  | 'affordable_housing'
  | 'homeownership'
  | 'home_repair';

export type HousingResource = {
  documentId: string;
  title: string;
  category: HousingCategory;
  summary: string;
  highlights: { value: string; label: string }[];
  eligibility: string[];
  requiredMaterials: string[];
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  acceptsInquiries: boolean;
  inquiryAllowsAttachments: boolean;
};

export type HousingListing = {
  documentId: string;
  title: string;
  address: string;
  neighborhood: Neighborhood | null;
  rentLabel: string | null;
  bedrooms: number | null;
  imageUrl: string | null;
  url: string | null;
  availableFrom: string | null;
};

export type HousingInquiryInput = {
  housingResource: string;
  message: string;
  preferredContact: 'email' | 'phone';
};

export type LibraryCategory = 'education' | 'financial_tools' | 'health' | 'small_business';
export type ResourceType = 'article' | 'video' | 'link';

export type LibraryResource = {
  documentId: string;
  title: string;
  description: string;
  category: LibraryCategory;
  resourceType: ResourceType;
  url: string | null;
  body: string | null;
  source: string | null;
  durationMinutes: number | null;
  featured: boolean;
};

export type BlightCategory =
  'illegal_dumping' | 'vacant_lot' | 'abandoned_building' | 'standing_water' | 'air_odor' | 'other';

export type BlightStatus =
  'submitted' | 'under_review' | 'reported_to_city' | 'resolved' | 'removed';

export type BlightReport = {
  documentId: string;
  /** Numeric id, shown to residents as "Report #1042". */
  id: number;
  category: BlightCategory;
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  status: BlightStatus;
  statusHistory: { status: BlightStatus; at: string }[];
  imageUrls: string[];
  createdAt: string;
};

export type BlightReportInput = {
  category: BlightCategory;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  keepNamePrivate: boolean;
  /** Local file URIs from the camera / photo library. */
  photos: { uri: string; mimeType?: string | null; fileName?: string | null }[];
};

export type EnvironmentCategory =
  'temperature' | 'air_quality' | 'water_quality' | 'mosquito' | 'heat';

export type EnvironmentLevel =
  | 'good'
  | 'moderate'
  | 'unhealthy_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous'
  | 'unknown';

export type EnvironmentReading = {
  category: EnvironmentCategory;
  value: number | null;
  unit: string | null;
  level: EnvironmentLevel;
  summary: string;
  observedAt: string | null;
  source: string | null;
  stale: boolean;
};

/** Compact summary for the home "Your neighborhood" card. */
export type EnvironmentGlance = {
  temperatureF: number | null;
  conditions: string | null;
  highF: number | null;
  lowF: number | null;
  airQuality: EnvironmentReading | null;
  activeAlerts: number;
  hourly: { time: string; temperatureF: number }[];
  updatedAt: string | null;
};
