/**
 * The only place `process.env.EXPO_PUBLIC_*` is read. Expo inlines these at build time,
 * so each one must be accessed with a static `process.env.EXPO_PUBLIC_X` expression.
 *
 * When a value is missing the app runs in **demo mode**: data comes from bundled sample
 * content (src/lib/api/mock-data.ts) and sign-in is simulated on the device. This lets
 * anyone build and click through the app without a backend or Supabase project.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const env = {
  supabaseUrl,
  supabasePublishableKey,
  apiUrl,
  /** Real auth needs both Supabase values. */
  hasSupabase: Boolean(supabaseUrl && supabasePublishableKey),
  /** Real data needs the Strapi URL. */
  hasApi: Boolean(apiUrl),
} as const;

/** Demo data is used whenever there is no API to talk to. */
export const isDemoData = !env.hasApi;

/** Demo auth is used whenever Supabase isn't configured. */
export const isDemoAuth = !env.hasSupabase;
