import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import * as api from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { demoProfile } from '@/lib/api/mock-data';
import { queryClient } from '@/lib/api/queries';
import type { Profile } from '@/lib/api/types';
import { isDemoAuth } from '@/lib/env';
import { storage, StorageKeys } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/** What the rest of the app needs to know about the signed-in user. */
type AuthSession = { userId: string; email: string | null; accessToken: string | null };

type SignUpInput = { fullName: string; email: string; phone: string; password: string };

type AuthContextValue = {
  session: AuthSession | null;
  profile: Profile | null;
  /** Set when /api/me fails (e.g. suspended account, server down). */
  profileError: ApiError | Error | null;
  isLoading: boolean;
  isAdmin: boolean;
  hasSeenWelcome: boolean;
  /** True when sign-in is simulated on the device (no Supabase configured). */
  isDemo: boolean;
  signIn: (email: string, password: string, opts?: { asStaff?: boolean }) => Promise<void>;
  /** Resolves `needsConfirmation: true` when Supabase wants the email confirmed first. */
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  markWelcomeSeen: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_REFRESH_MS = 5 * 60_000;

function fromSupabase(session: Session | null): AuthSession | null {
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    accessToken: session.access_token,
  };
}

type DemoSession = { email: string; fullName?: string; asStaff?: boolean };

function readDemoSession(): DemoSession | null {
  const raw = storage.get(StorageKeys.demoSession);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

function demoProfileFor(demo: DemoSession): Profile {
  return {
    ...demoProfile,
    email: demo.email,
    fullName: demo.fullName ?? demoProfile.fullName,
    role: demo.asStaff ? 'admin' : 'resident',
  };
}

/** Demo mode restores its session synchronously from on-device storage. */
function initialDemoState(): { session: AuthSession | null; profile: Profile | null } {
  if (!isDemoAuth) return { session: null, profile: null };
  const demo = readDemoSession();
  if (!demo) return { session: null, profile: null };
  api.resetDemoProfile(demo.fullName, demo.email);
  return {
    session: { userId: 'demo-user', email: demo.email, accessToken: null },
    profile: demoProfileFor(demo),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(initialDemoState);
  const [session, setSession] = useState<AuthSession | null>(initial.session);
  const [profile, setProfile] = useState<Profile | null>(initial.profile);
  const [profileError, setProfileError] = useState<ApiError | Error | null>(null);
  // Demo auth has nothing to load; real auth waits for the stored Supabase session.
  const [isLoading, setIsLoading] = useState(!isDemoAuth);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(
    () => storage.get(StorageKeys.hasSeenWelcome) === '1',
  );
  const lastProfileFetch = useRef(0);
  const currentUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const me = await api.getMe();
      setProfile(me);
      api.touchLastSeen().catch(() => undefined);
      setProfileError(null);
    } catch (error) {
      setProfile(null);
      setProfileError(error as Error);
    } finally {
      lastProfileFetch.current = Date.now();
    }
  }, []);

  // Restore the session on launch and follow auth changes.
  useEffect(() => {
    if (isDemoAuth) return;

    let cancelled = false;
    supabase!.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const next = fromSupabase(data.session);
      setSession(next);
      currentUserId.current = next?.userId ?? null;
      if (next) await loadProfile();
      setIsLoading(false);
    });

    const { data: listener } = supabase!.auth.onAuthStateChange((event, newSession) => {
      const next = fromSupabase(newSession);
      setSession(next);
      if (!next) {
        currentUserId.current = null;
        setProfile(null);
        setProfileError(null);
        return;
      }
      // Don't await Supabase calls inside this callback (Supabase docs); defer the fetch.
      if (event === 'SIGNED_IN' && next.userId !== currentUserId.current) {
        currentUserId.current = next.userId;
        setTimeout(() => loadProfile(), 0);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Re-check the profile (role/status) when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (
        state === 'active' &&
        session &&
        !isDemoAuth &&
        Date.now() - lastProfileFetch.current > PROFILE_REFRESH_MS
      ) {
        loadProfile();
      }
    });
    return () => sub.remove();
  }, [session, loadProfile]);

  const markWelcomeSeen = useCallback(() => {
    storage.set(StorageKeys.hasSeenWelcome, '1');
    setHasSeenWelcome(true);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, opts?: { asStaff?: boolean }) => {
      const normalized = email.trim().toLowerCase();
      if (isDemoAuth) {
        const demo: DemoSession = { email: normalized, asStaff: opts?.asStaff };
        storage.set(StorageKeys.demoSession, JSON.stringify(demo));
        api.resetDemoProfile(undefined, normalized);
        setSession({ userId: 'demo-user', email: normalized, accessToken: null });
        setProfile(demoProfileFor(demo));
        markWelcomeSeen();
        return;
      }
      const { error } = await supabase!.auth.signInWithPassword({ email: normalized, password });
      if (error) throw error;
      markWelcomeSeen();
    },
    [markWelcomeSeen],
  );

  const signUp = useCallback(
    async ({ fullName, email, phone, password }: SignUpInput) => {
      const normalized = email.trim().toLowerCase();
      if (isDemoAuth) {
        const demo: DemoSession = { email: normalized, fullName: fullName.trim() };
        storage.set(StorageKeys.demoSession, JSON.stringify(demo));
        api.resetDemoProfile(demo.fullName, normalized);
        setSession({ userId: 'demo-user', email: normalized, accessToken: null });
        setProfile(demoProfileFor(demo));
        markWelcomeSeen();
        return { needsConfirmation: false };
      }
      const { data, error } = await supabase!.auth.signUp({
        email: normalized,
        password,
        options: { data: { full_name: fullName.trim(), phone } },
      });
      if (error) throw error;
      // With email confirmation on, Supabase hides existing accounts by returning a user with
      // no identities and no session. Treat it the same as "check your email" (no enumeration).
      markWelcomeSeen();
      return { needsConfirmation: !data.session };
    },
    [markWelcomeSeen],
  );

  const signOut = useCallback(async () => {
    if (isDemoAuth) {
      storage.remove(StorageKeys.demoSession);
      setSession(null);
      setProfile(null);
    } else {
      await supabase!.auth.signOut();
    }
    queryClient.clear();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (isDemoAuth) return;
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'historichunterhills://reset-password',
    });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    if (isDemoAuth) return;
    await loadProfile();
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      profileError,
      isLoading,
      isAdmin: profile?.role === 'admin' && profile.status === 'active',
      hasSeenWelcome,
      isDemo: isDemoAuth,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
      setProfile,
      markWelcomeSeen,
    }),
    [
      session,
      profile,
      profileError,
      isLoading,
      hasSeenWelcome,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
      markWelcomeSeen,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
