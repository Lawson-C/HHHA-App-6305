import { route } from '../../../utils/routes';

export default {
  routes: [
    route.public('POST', '/push-tokens', 'push-token.register'),
    route.public('DELETE', '/push-tokens/:token', 'push-token.unregister'),
  ],
};
