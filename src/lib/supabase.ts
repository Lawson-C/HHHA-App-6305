import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from '@/lib/env';

/**
 * Supabase client, configured per the Expo SDK 57 guide
 * (https://docs.expo.dev/guides/using-supabase/). Used for auth only (AGENTS.md rule 1).
 * `null` in demo mode, when the Supabase env vars aren't set.
 */
export const supabase: SupabaseClient | null = env.hasSupabase
  ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase) {
  // Only refresh tokens while the app is in the foreground.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
