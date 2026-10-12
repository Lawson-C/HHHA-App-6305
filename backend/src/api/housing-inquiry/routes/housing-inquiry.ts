import { route } from '../../../utils/routes';

export default {
  routes: [
    route.resident('GET', '/housing-inquiries', 'housing-inquiry.find'),
    route.resident('GET', '/housing-inquiries/:documentId', 'housing-inquiry.findOne'),
    route.resident('POST', '/housing-inquiries', 'housing-inquiry.create'),
    route.admin('PUT', '/housing-inquiries/:documentId', 'housing-inquiry.update'),
  ],
};
