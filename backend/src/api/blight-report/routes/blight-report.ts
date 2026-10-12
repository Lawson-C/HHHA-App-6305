import { route } from '../../../utils/routes';

// Custom serializers (never `reporter` for the public), so no core routes here.
export default {
  routes: [
    route.resident('GET', '/blight-reports/mine', 'blight-report.mine'),
    route.public('GET', '/blight-reports', 'blight-report.find'),
    route.public('GET', '/blight-reports/:documentId', 'blight-report.findOne'),
    route.resident('POST', '/blight-reports', 'blight-report.create'),
    route.admin('PUT', '/blight-reports/:documentId', 'blight-report.update'),
  ],
};
