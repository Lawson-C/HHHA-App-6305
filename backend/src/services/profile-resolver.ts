import type { SupabaseClaims } from '../utils/supabase-jwt';
import { UID, docs, dbq } from '../utils/uids';
import { E164_RE } from '../utils/validation';

export const PROFILE_POPULATE = ['notificationPreferences'];
const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000;

const DEFAULT_PREFERENCES = {
  healthWarnings: true,
  communityAnnouncements: true,
  meetingReminders: true,
};

// Concurrent first requests for the same user share one creation (AC4).
const inflight = new Map<string, Promise<any>>();

const findBySub = (sub: string) =>
  docs(UID.profile).findFirst({ filters: { supabaseUserId: sub }, populate: PROFILE_POPULATE });

/** Display name for a new profile: metadata full_name, else the email's local part (Q-C). */
export function initialFullName(claims: SupabaseClaims): string {
  const fromMeta = claims.userMetadata.full_name ?? claims.userMetadata.name;
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    return fromMeta.trim().slice(0, 100);
  }
  const local = claims.email?.split('@')[0]?.trim();
  return (local || 'Neighbor').slice(0, 100);
}

async function createProfile(claims: SupabaseClaims) {
  const phone = claims.userMetadata.phone;
  try {
    return await docs(UID.profile).create({
      data: {
        supabaseUserId: claims.sub,
        // role and status are hard-coded: never taken from claims or metadata (AGENTS rule 3).
        role: 'resident',
        status: 'active',
        email: claims.email ? claims.email.toLowerCase() : null,
        fullName: initialFullName(claims),
        phone: typeof phone === 'string' && E164_RE.test(phone) ? phone : null,
        notificationPreferences: { ...DEFAULT_PREFERENCES },
        lastSeenAt: new Date().toISOString(),
      },
      populate: PROFILE_POPULATE,
    });
  } catch (error) {
    // Another instance won the race (unique index on supabaseUserId): use its row.
    const existing = await findBySub(claims.sub);
    if (existing) return existing;
    throw error;
  }
}

/** Keeps lastSeenAt (throttled) and the email mirror up to date. Never fails the request. */
function touch(profile: any, claims: SupabaseClaims) {
  const data: Record<string, unknown> = {};
  const lastSeen = profile.lastSeenAt ? new Date(profile.lastSeenAt).getTime() : 0;
  if (Date.now() - lastSeen > LAST_SEEN_THROTTLE_MS) {
    data.lastSeenAt = new Date();
  }
  const email = claims.email?.toLowerCase() ?? null;
  if (email && email !== profile.email) {
    data.email = email;
    profile.email = email;
  }
  if (Object.keys(data).length) {
    // Direct DB write: skips document-service middlewares (bookkeeping, not an admin action).
    dbq(UID.profile)
      .updateMany({ where: { documentId: profile.documentId }, data })
      .catch((error: Error) =>
        strapi.log.warn(`Could not update profile lastSeenAt: ${error.message}`),
      );
  }
}

export async function findOrCreateProfile(claims: SupabaseClaims) {
  const existing = await findBySub(claims.sub);
  if (existing) {
    touch(existing, claims);
    return existing;
  }

  let pending = inflight.get(claims.sub);
  if (!pending) {
    pending = (async () => (await findBySub(claims.sub)) ?? createProfile(claims))();
    inflight.set(claims.sub, pending);
    pending.finally(() => inflight.delete(claims.sub)).catch(() => undefined);
  }
  return pending;
}
