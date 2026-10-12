import { route } from '../../../utils/routes';

// No core routes for profiles: /api/profiles does not exist (only /api/me and /api/admin/users).
export default {
  routes: [route.resident('GET', '/me', 'me.find'), route.resident('PUT', '/me', 'me.update')],
};
