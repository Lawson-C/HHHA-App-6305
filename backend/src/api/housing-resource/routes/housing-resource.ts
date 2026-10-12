import { route } from '../../../utils/routes';

export default {
  routes: [
    route.scoped('GET', '/housing-resources', 'api::housing-resource.housing-resource.find'),
    route.scoped('GET', '/housing-resources/:id', 'api::housing-resource.housing-resource.findOne'),
    route.admin('POST', '/housing-resources', 'api::housing-resource.housing-resource.create'),
    route.admin('PUT', '/housing-resources/:id', 'api::housing-resource.housing-resource.update'),
    route.admin(
      'DELETE',
      '/housing-resources/:id',
      'api::housing-resource.housing-resource.delete',
    ),
  ],
};
