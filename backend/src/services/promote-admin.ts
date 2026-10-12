import { UID, docs } from '../utils/uids';

export class PromoteAdminError extends Error {}

/**
 * Promotes the profile with this email to admin (initial admin, Q-001). The user must have
 * signed in to the app once so their profile exists. Returns a human-readable message.
 * Writes an admin-activity-log entry with no actor (the team ran a script).
 */
export async function promoteAdmin(rawEmail: string): Promise<string> {
  const email = String(rawEmail ?? '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    throw new PromoteAdminError('Usage: npm run promote-admin -- user@example.com');
  }
  const matches = await docs(UID.profile).findMany({ filters: { email: { $eqi: email } } });
  if (matches.length === 0) {
    throw new PromoteAdminError(
      'No profile for that email. The user must sign in to the app once first.',
    );
  }
  if (matches.length > 1) {
    throw new PromoteAdminError(
      `More than one profile has that email: ${matches.map((p: any) => p.documentId).join(', ')}`,
    );
  }
  const profile = matches[0];
  if (profile.status === 'banned') {
    throw new PromoteAdminError('That account is banned. Reactivate it before promoting.');
  }
  if (profile.role === 'admin') {
    return `${email} is already an admin.`;
  }
  await docs(UID.profile).update({ documentId: profile.documentId, data: { role: 'admin' } });
  await docs(UID.adminActivityLog).create({
    data: {
      actor: null,
      action: 'role_granted',
      targetType: UID.profile,
      targetId: profile.documentId,
      details: { via: 'promote-admin script', from: profile.role, to: 'admin' },
    },
  });
  return `${email} is now an admin.`;
}
