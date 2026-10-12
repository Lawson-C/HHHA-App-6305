import { route } from '../../../utils/routes';

export default {
  routes: [
    route.admin('GET', '/admin/users', 'admin.users'),
    route.admin('PUT', '/admin/users/:documentId/role', 'admin.setRole'),
    route.admin('PUT', '/admin/users/:documentId/status', 'admin.setStatus'),
    route.admin('GET', '/admin/summary', 'admin.summary'),
    route.admin('GET', '/admin/activity', 'admin.activity'),
    route.admin('GET', '/admin/export/:file', 'admin.exportCsv'),
  ],
};
