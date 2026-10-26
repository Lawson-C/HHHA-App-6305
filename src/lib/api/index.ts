/**
 * Data access for every screen: published content from Sanity (./content) and resident data
 * from Supabase (./resident). Each falls back to on-device demo data when its service isn't
 * configured (src/lib/env.ts). Screens use these through the React Query hooks in ./queries.
 */
export {
  getAlert,
  getAppCopy,
  getHousingResource,
  getLibraryResource,
  listAlerts,
  listEvents,
  listHousingListings,
  listHousingResources,
  listLibrary,
  type AlertFilter,
  type AppCopy,
} from '@/lib/api/content';
export {
  createBlightReport,
  createHousingInquiry,
  findNearbyReports,
  getEnvironment,
  getEnvironmentGlance,
  getEvent,
  getMe,
  listMyReports,
  registerPushToken,
  removeReminder,
  resetDemoProfile,
  setReminder,
  touchLastSeen,
  updateMe,
} from '@/lib/api/resident';
