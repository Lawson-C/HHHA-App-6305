import { useEffect, useRef } from 'react';

import { updateMe } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-provider';
import { pickNeighborhood, useCurrentNeighborhood } from '@/lib/location';

/**
 * The neighborhood shown on Home and the neighborhood screen, plus the location controls.
 * When a signed-in resident hasn't picked a neighborhood yet, the detected one is saved to
 * their profile (they can change it in Profile → My neighborhood).
 */
export function useNeighborhood() {
  const { profile, setProfile } = useAuth();
  const { state, request } = useCurrentNeighborhood();
  const picked = pickNeighborhood(state, profile?.neighborhood);
  const saving = useRef(false);

  useEffect(() => {
    const detected = state.status === 'located' ? state.neighborhood : null;
    if (!detected || !profile || profile.neighborhood || saving.current) return;
    saving.current = true;
    updateMe({ neighborhood: detected })
      .then(setProfile)
      .catch(() => undefined)
      .finally(() => {
        saving.current = false;
      });
  }, [state, profile, setProfile]);

  return { ...picked, location: state, requestLocation: request };
}
