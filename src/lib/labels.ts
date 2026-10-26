/**
 * Display labels, tones and icons for enum values. Enum values themselves come from
 * docs/data-model.md; only their presentation lives here.
 */
import {
  BookOpen,
  Building2,
  Bug,
  Droplets,
  Fence,
  FileText,
  GraduationCap,
  House,
  KeyRound,
  Landmark,
  CircleHelp,
  PiggyBank,
  Play,
  ShieldCheck,
  Store,
  ExternalLink,
  Trash2,
  TriangleAlert,
  Users,
  Wind,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react-native';

import type {
  AlertCategory,
  BlightCategory,
  BlightStatus,
  EnvironmentLevel,
  EventType,
  HousingCategory,
  LibraryCategory,
  Neighborhood,
  ResourceType,
} from '@/lib/api/types';
import { Colors, type Tone } from '@/constants/theme';

type Presentation = { label: string; tone: Tone; icon: LucideIcon };

export const alertCategory: Record<AlertCategory, Presentation> = {
  emergency: { label: 'Emergency', tone: 'danger', icon: TriangleAlert },
  health_warning: { label: 'Health', tone: 'warning', icon: Bug },
  community_announcement: { label: 'Community', tone: 'info', icon: Users },
  meeting_reminder: { label: 'Civic', tone: 'civic', icon: Landmark },
};

/** Calendar colors follow Figma's category/* tokens. */
export const eventType: Record<EventType, { label: string; shortLabel: string; tone: Tone }> = {
  workforce_development: { label: 'Workforce', shortLabel: 'Workforce', tone: 'info' },
  financial_literacy: { label: 'Financial literacy', shortLabel: 'Finance', tone: 'warning' },
  wellness: { label: 'Wellness', shortLabel: 'Wellness', tone: 'success' },
  civic_meeting: { label: 'Civic', shortLabel: 'Civic', tone: 'civic' },
  community_gathering: { label: 'Community', shortLabel: 'Community', tone: 'danger' },
  other: { label: 'Other', shortLabel: 'Other', tone: 'neutral' },
};

export const eventIcon: Record<EventType, LucideIcon> = {
  workforce_development: Building2,
  financial_literacy: PiggyBank,
  wellness: HeartPulse,
  civic_meeting: Landmark,
  community_gathering: Users,
  other: CircleHelp,
};

export const housingCategory: Record<HousingCategory, { label: string; icon: LucideIcon }> = {
  rental_assistance: { label: 'Rental assistance', icon: PiggyBank },
  eviction_prevention: { label: 'Eviction prevention', icon: ShieldCheck },
  affordable_housing: { label: 'Affordable housing', icon: Building2 },
  homeownership: { label: 'Homeownership', icon: KeyRound },
  home_repair: { label: 'Home repair', icon: House },
};

export const libraryCategory: Record<LibraryCategory, { label: string; tone: Tone }> = {
  financial_tools: { label: 'Money', tone: 'warning' },
  health: { label: 'Health', tone: 'success' },
  education: { label: 'Education', tone: 'info' },
  small_business: { label: 'Small business', tone: 'civic' },
};

export const libraryCategoryIcon: Record<LibraryCategory, LucideIcon> = {
  financial_tools: PiggyBank,
  health: HeartPulse,
  education: GraduationCap,
  small_business: Store,
};

export const resourceType: Record<ResourceType, { label: string; icon: LucideIcon }> = {
  video: { label: 'Video', icon: Play },
  article: { label: 'Article', icon: FileText },
  link: { label: 'Link', icon: ExternalLink },
};

export const blightCategory: Record<
  BlightCategory,
  { label: string; hint: string; icon: LucideIcon }
> = {
  illegal_dumping: { label: 'Illegal dumping', hint: 'Trash, tires, furniture', icon: Trash2 },
  vacant_lot: { label: 'Vacant lot', hint: 'Overgrown or unsafe', icon: Fence },
  abandoned_building: {
    label: 'Abandoned building',
    hint: 'Open, damaged or unsafe',
    icon: Building2,
  },
  standing_water: { label: 'Standing water', hint: 'Mosquito breeding', icon: Droplets },
  air_odor: { label: 'Air or odor', hint: 'Smoke, fumes, dust', icon: Wind },
  other: { label: 'Something else', hint: 'Tell us in your words', icon: CircleHelp },
};

export const blightStatus: Record<BlightStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Submitted', tone: 'neutral' },
  under_review: { label: 'Under review', tone: 'info' },
  reported_to_city: { label: 'Sent to the City', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  removed: { label: 'Removed', tone: 'neutral' },
};

/** The four steps shown on the "Report sent" progress timeline. */
export const blightSteps: BlightStatus[] = [
  'submitted',
  'under_review',
  'reported_to_city',
  'resolved',
];

export const environmentLevel: Record<EnvironmentLevel, { label: string; color: string }> = {
  good: { label: 'Good', color: Colors.success },
  moderate: { label: 'Moderate', color: Colors.warning },
  unhealthy_sensitive: { label: 'Unhealthy for sensitive groups', color: Colors.danger },
  unhealthy: { label: 'Unhealthy', color: Colors.danger },
  very_unhealthy: { label: 'Very unhealthy', color: Colors.danger },
  hazardous: { label: 'Hazardous', color: Colors.danger },
  unknown: { label: 'Not available', color: Colors.textSecondary },
};

export const neighborhoods: Record<Neighborhood, { label: string; npu: string }> = {
  english_avenue: { label: 'English Avenue', npu: 'NPU L' },
  vine_city: { label: 'Vine City', npu: 'NPU L' },
  hunter_hills: { label: 'Hunter Hills', npu: 'NPU K' },
  washington_park: { label: 'Washington Park', npu: 'NPU K' },
  bankhead: { label: 'Historic Westin Heights / Bankhead', npu: 'NPU K' },
  knight_park: { label: 'Knight Park / Howell Station', npu: 'NPU K' },
  dixie_hills: { label: 'Dixie Hills', npu: 'NPU J' },
  west_lake: { label: 'West Lake', npu: 'NPU J' },
  center_hill: { label: 'Center Hill', npu: 'NPU J' },
  harvel_homes: { label: 'Harvel Homes Community', npu: 'NPU J' },
  georgia_tech: { label: 'Georgia Tech', npu: 'NPU E' },
};

export const LibraryIcon = BookOpen;
