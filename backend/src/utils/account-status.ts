export type ProfileLike = {
  status?: string | null;
  suspendedUntil?: string | Date | null;
};

/**
 * A profile is blocked when it is banned, or suspended with no end date (indefinite) or an
 * end date still in the future. A past `suspendedUntil` means access is allowed again; we
 * don't write `active` back (decision Q-D).
 */
export function isBlocked(profile: ProfileLike, now: Date = new Date()): boolean {
  if (profile.status === 'banned') return true;
  if (profile.status === 'suspended') {
    if (!profile.suspendedUntil) return true;
    return new Date(profile.suspendedUntil).getTime() > now.getTime();
  }
  return false;
}
