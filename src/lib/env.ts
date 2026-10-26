/**
 * The only place `process.env.EXPO_PUBLIC_*` is read. Expo inlines these at build time,
 * so each one must be accessed with a static `process.env.EXPO_PUBLIC_X` expression.
 *
 * Missing values switch the app into **demo mode** (decision D-016):
 * - no Sanity project → content (alerts, events, housing, library) comes from
 *   src/lib/api/mock-data.ts;
 * - no Supabase → sign-in is simulated on the device and resident data stays on the device.
 * This lets anyone build and click through the app without any accounts.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const sanityProjectId = process.env.EXPO_PUBLIC_SANITY_PROJECT_ID ?? '';
const sanityDataset = process.env.EXPO_PUBLIC_SANITY_DATASET ?? 'production';
/** Optional: where staff edit content (e.g. https://hunter-hills.sanity.studio). */
const sanityStudioUrl = process.env.EXPO_PUBLIC_SANITY_STUDIO_URL ?? '';

export const env = {
  supabaseUrl,
  supabasePublishableKey,
  sanityProjectId,
  sanityDataset,
  sanityStudioUrl,
  hasSupabase: Boolean(supabaseUrl && supabasePublishableKey),
  hasSanity: Boolean(sanityProjectId),
} as const;

/** Content (Sanity) falls back to bundled demo content. */
export const isDemoContent = !env.hasSanity;

/** Accounts and resident data (Supabase) fall back to an on-device simulation. */
export const isDemoAuth = !env.hasSupabase;
