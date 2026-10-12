import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { BlightCategory, BlightReport } from '@/lib/api/types';

export type DraftPhoto = { uri: string; mimeType?: string | null; fileName?: string | null };

export type ReportDraft = {
  category: BlightCategory | null;
  photos: DraftPhoto[];
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string | null;
    source: 'gps' | 'default';
  } | null;
  keepNamePrivate: boolean;
};

const empty: ReportDraft = {
  category: null,
  photos: [],
  description: '',
  location: null,
  keepNamePrivate: true,
};

/** Rough center of Council District 3, used when location permission is denied. */
const DISTRICT_CENTER = { latitude: 33.759, longitude: -84.425 };

function formatAddress(a: Location.LocationGeocodedAddress | undefined) {
  if (!a) return null;
  const street = [a.streetNumber, a.street].filter(Boolean).join(' ');
  return street ? `Near ${street}` : (a.name ?? null);
}

type DraftContext = {
  draft: ReportDraft;
  locating: boolean;
  /** Explains a fallback location or failure; null when GPS worked. */
  locationNote: string | null;
  /** Ask for permission (if needed) and fill `draft.location` from GPS. Call from a user action. */
  locate: () => Promise<void>;
  update: (patch: Partial<ReportDraft>) => void;
  reset: () => void;
  submitted: BlightReport | null;
  setSubmitted: (report: BlightReport | null) => void;
};

const Ctx = createContext<DraftContext | null>(null);

/** Holds the in-progress blight report across the report flow screens. */
export function ReportDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ReportDraft>(empty);
  const [submitted, setSubmitted] = useState<BlightReport | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const locate = useCallback(async () => {
    setLocating(true);
    setLocationNote(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDraft((d) => ({
          ...d,
          location: {
            ...DISTRICT_CENTER,
            address: 'District 3 (location not shared)',
            source: 'default',
          },
        }));
        setLocationNote(
          'Location is off, so we used the center of District 3. Add the street in the description.',
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let address: string | null = null;
      try {
        const [first] = await Location.reverseGeocodeAsync(pos.coords);
        address = formatAddress(first);
      } catch {
        // Reverse geocoding is best-effort.
      }
      setDraft((d) => ({
        ...d,
        location: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          address,
          source: 'gps',
        },
      }));
    } catch {
      setLocationNote("We couldn't get your location. Try again or describe where it is.");
    } finally {
      setLocating(false);
    }
  }, []);

  const value = useMemo<DraftContext>(
    () => ({
      draft,
      locating,
      locationNote,
      locate,
      update: (patch) => setDraft((d) => ({ ...d, ...patch })),
      reset: () => {
        setDraft(empty);
        setSubmitted(null);
        setLocationNote(null);
      },
      submitted,
      setSubmitted,
    }),
    [draft, submitted, locating, locationNote, locate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReportDraft() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useReportDraft must be used inside <ReportDraftProvider>');
  return value;
}
