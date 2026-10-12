import { route } from '../../../utils/routes';

export default {
  routes: [
    route.scoped('GET', '/events', 'api::event.event.find'),
    route.scoped('GET', '/events/:id', 'api::event.event.findOne'),
    route.admin('POST', '/events', 'api::event.event.create'),
    route.admin('PUT', '/events/:id', 'api::event.event.update'),
    route.admin('DELETE', '/events/:id', 'api::event.event.delete'),
  ],
};
