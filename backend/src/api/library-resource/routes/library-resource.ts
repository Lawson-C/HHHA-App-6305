import { route } from '../../../utils/routes';

export default {
  routes: [
    route.scoped('GET', '/library-resources', 'api::library-resource.library-resource.find'),
    route.scoped('GET', '/library-resources/:id', 'api::library-resource.library-resource.findOne'),
    route.admin('POST', '/library-resources', 'api::library-resource.library-resource.create'),
    route.admin('PUT', '/library-resources/:id', 'api::library-resource.library-resource.update'),
    route.admin(
      'DELETE',
      '/library-resources/:id',
      'api::library-resource.library-resource.delete',
    ),
  ],
};
