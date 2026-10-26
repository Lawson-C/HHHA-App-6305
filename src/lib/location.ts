/**
 * Which District 3 neighborhood the device is in, worked out on the phone from the City of
 * Atlanta's official boundaries (src/data/neighborhoods.json, scripts/fetch-neighborhoods.py).
 * The location never leaves the device (docs/security.md, Location privacy).
 */
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import boundaries from '@/data/neighborhoods.json';
import type { Neighborhood } from '@/lib/api/types';
import { storage, StorageKeys } from '@/lib/storage';

type Ring = number[][]; // [lng, lat] pairs, GeoJSON order
type Geometry =
  { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

/** Ray casting: is (lng, lat) inside the ring? */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside the outer ring and not inside any hole. */
function inPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  const [outer, ...holes] = rings;
  return Boolean(outer && inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)));
}

/** The neighborhood containing the point, or null when it's outside all 11. */
export function findNeighborhood(latitude: number, longitude: number): Neighborhood | null {
  for (const feature of boundaries.features) {
    const geometry = feature.geometry as Geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (polygons.some((rings) => inPolygon(longitude, latitude, rings))) {
      return feature.properties.id as Neighborhood;
    }
  }
  return null;
}

export type LocationState =
  | { status: 'unknown' } // permission not asked yet
  | { status: 'denied' }
  | { status: 'locating' }
  | { status: 'located'; neighborhood: Neighborhood | null } // null = outside District 3
  | { status: 'error' };

function cachedNeighborhood(): Neighborhood | null | undefined {
  const raw = storage.get(StorageKeys.lastNeighborhood);
  if (raw === null) return undefined;
  return raw === 'outside' ? null : (raw as Neighborhood);
}

/**
 * The neighborhood the phone is in right now. Never prompts on its own: call `request()` from a
 * user action (e.g. "Use my location"). Re-checks when the app returns to the foreground.
 */
export function useCurrentNeighborhood() {
  const [state, setState] = useState<LocationState>(() => {
    const cached = cachedNeighborhood();
    return cached === undefined
      ? { status: 'unknown' }
      : { status: 'located', neighborhood: cached };
  });

  const locate = useCallback(async (ask: boolean) => {
    try {
      const permission = ask
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setState(
          permission.status === 'denied'
            ? { status: 'denied' }
            : (s) => (s.status === 'located' ? s : { status: 'unknown' }),
        );
        return;
      }
      setState((s) => (s.status === 'located' ? s : { status: 'locating' }));
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const neighborhood = findNeighborhood(position.coords.latitude, position.coords.longitude);
      storage.set(StorageKeys.lastNeighborhood, neighborhood ?? 'outside');
      setState({ status: 'located', neighborhood });
    } catch {
      setState((s) => (s.status === 'located' ? s : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    // Initial check runs once the permission read resolves (never prompts).
    Location.getForegroundPermissionsAsync()
      .then(() => locate(false))
      .catch(() => undefined);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') locate(false);
    });
    return () => sub.remove();
  }, [locate]);

  return { state, request: () => locate(true) };
}

/**
 * The neighborhood to show on Home and the neighborhood screen:
 * where the phone is (if location is on and inside District 3), else the one saved in the
 * profile, else District 3 as a whole (null).
 */
export function pickNeighborhood(
  location: LocationState,
  saved: Neighborhood | null | undefined,
): { neighborhood: Neighborhood | null; fromLocation: boolean; outside: boolean } {
  if (location.status === 'located' && location.neighborhood) {
    return { neighborhood: location.neighborhood, fromLocation: true, outside: false };
  }
  return {
    neighborhood: saved ?? null,
    fromLocation: false,
    outside: location.status === 'located' && location.neighborhood === null,
  };
}
