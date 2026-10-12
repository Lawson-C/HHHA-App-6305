import { route } from '../../../utils/routes';

// Computed endpoints over the reading cache. Raw readings have no public routes.
export default {
  routes: [
    route.public('GET', '/environment', 'environment.current'),
    route.public('GET', '/environment/glance', 'environment.glance'),
  ],
};
