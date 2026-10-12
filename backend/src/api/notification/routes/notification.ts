import { route } from '../../../utils/routes';

export default {
  routes: [
    route.scoped('GET', '/notifications', 'api::notification.notification.find'),
    route.scoped('GET', '/notifications/:id', 'api::notification.notification.findOne'),
    route.admin('POST', '/notifications', 'api::notification.notification.create'),
  ],
};
