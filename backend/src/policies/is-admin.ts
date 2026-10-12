import { errors } from '@strapi/utils';
import { requireActiveProfile } from './is-authenticated';

/** global::is-admin: like is-authenticated, plus profile.role === 'admin' (from the DB only). */
export default (policyContext: any) => {
  const profile = requireActiveProfile(policyContext);
  if (profile.role !== 'admin') {
    throw new errors.PolicyError('Admin only');
  }
  return true;
};
