import { errors } from '@strapi/utils';
import { isBlocked } from '../utils/account-status';

/** Shared check used by both global policies. Throws 401/403 or returns the profile. */
export function requireActiveProfile(ctx: any) {
  const profile = ctx.state?.profile;
  if (!profile) {
    throw new errors.UnauthorizedError('Sign in required');
  }
  if (isBlocked(profile)) {
    const banned = profile.status === 'banned';
    throw new errors.PolicyError(banned ? 'Account banned' : 'Account suspended', {
      status: profile.status,
      suspendedUntil: profile.suspendedUntil ?? null,
    });
  }
  return profile;
}

/** global::is-authenticated: a signed-in, non-suspended, non-banned profile. */
export default (policyContext: any) => {
  requireActiveProfile(policyContext);
  return true;
};
