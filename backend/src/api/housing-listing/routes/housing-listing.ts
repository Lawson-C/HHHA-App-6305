import { route } from '../../../utils/routes';

export default {
  routes: [
    route.scoped('GET', '/housing-listings', 'api::housing-listing.housing-listing.find'),
    route.scoped('GET', '/housing-listings/:id', 'api::housing-listing.housing-listing.findOne'),
    route.admin('POST', '/housing-listings', 'api::housing-listing.housing-listing.create'),
    route.admin('PUT', '/housing-listings/:id', 'api::housing-listing.housing-listing.update'),
    route.admin('DELETE', '/housing-listings/:id', 'api::housing-listing.housing-listing.delete'),
  ],
};
