import { UID, docs } from '../../../utils/uids';
import { E164_RE, Validator, isPlainObject, readBodyData } from '../../../utils/validation';
import { PROFILE_POPULATE } from '../../../services/profile-resolver';

const PREFERENCE_KEYS = ['healthWarnings', 'communityAnnouncements', 'meetingReminders'] as const;
const NEIGHBORHOODS = [
  'english_avenue',
  'vine_city',
  'hunter_hills',
  'washington_park',
  'bankhead',
  'knight_park',
  'dixie_hills',
  'west_lake',
  'center_hill',
  'harvel_homes',
  'georgia_tech',
];
const TEXT_SIZES = ['default', 'large', 'extra_large'];
const LANGUAGES = ['en', 'es'];

/** Explicit allow-list: the owner sees their own private email/phone, nothing else leaks. */
export function toMe(profile: any) {
  const prefs = profile.notificationPreferences ?? {};
  return {
    documentId: profile.documentId,
    fullName: profile.fullName,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    role: profile.role,
    status: profile.status,
    suspendedUntil: profile.suspendedUntil ?? null,
    neighborhood: profile.neighborhood ?? null,
    textSize: profile.textSize ?? 'default',
    language: profile.language ?? 'en',
    notificationPreferences: {
      healthWarnings: prefs.healthWarnings !== false,
      communityAnnouncements: prefs.communityAnnouncements !== false,
      meetingReminders: prefs.meetingReminders !== false,
    },
  };
}

export default {
  async find(ctx: any) {
    return { data: toMe(ctx.state.profile) };
  },

  /**
   * Editable: fullName, phone, notificationPreferences (partial), neighborhood, textSize,
   * language. Everything else (role, status, supabaseUserId, email, ...) is silently ignored.
   */
  async update(ctx: any) {
    const body = readBodyData(ctx);
    const profile = ctx.state.profile;
    const v = new Validator();
    const data: Record<string, unknown> = {};

    if ('fullName' in body) {
      const name = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      if (name.length < 1 || name.length > 100) v.add('fullName', 'Name must be 1–100 characters');
      else data.fullName = name;
    }
    if ('phone' in body) {
      if (body.phone === null || body.phone === '') data.phone = null;
      else if (typeof body.phone === 'string' && E164_RE.test(body.phone)) data.phone = body.phone;
      else v.add('phone', 'Phone must be in E.164 format, e.g. +14045550123');
    }
    if ('neighborhood' in body) {
      if (body.neighborhood === null || NEIGHBORHOODS.includes(body.neighborhood as string))
        data.neighborhood = body.neighborhood;
      else v.add('neighborhood', 'Unknown neighborhood');
    }
    if ('textSize' in body) {
      if (TEXT_SIZES.includes(body.textSize as string)) data.textSize = body.textSize;
      else v.add('textSize', 'textSize must be default, large or extra_large');
    }
    if ('language' in body) {
      if (LANGUAGES.includes(body.language as string)) data.language = body.language;
      else v.add('language', 'language must be en or es');
    }
    if ('notificationPreferences' in body) {
      const prefs = body.notificationPreferences;
      if (!isPlainObject(prefs)) {
        v.add('notificationPreferences', 'notificationPreferences must be an object');
      } else {
        for (const [key, value] of Object.entries(prefs)) {
          if (!(PREFERENCE_KEYS as readonly string[]).includes(key)) {
            v.add(`notificationPreferences.${key}`, `Unknown preference "${key}"`);
          } else if (typeof value !== 'boolean') {
            v.add(`notificationPreferences.${key}`, `${key} must be true or false`);
          }
        }
        // A component update replaces the whole component, so merge with the current values.
        const current = toMe(profile).notificationPreferences;
        data.notificationPreferences = { ...current, ...prefs };
      }
    }
    v.throwIfAny();

    if (Object.keys(data).length === 0) {
      return { data: toMe(profile) };
    }
    const updated = await docs(UID.profile).update({
      documentId: profile.documentId,
      data,
      populate: PROFILE_POPULATE,
    });
    ctx.state.profile = updated;
    return { data: toMe(updated) };
  },
};
