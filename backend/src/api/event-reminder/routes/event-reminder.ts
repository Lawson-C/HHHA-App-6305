import { route } from '../../../utils/routes';

export default {
  routes: [
    route.resident('GET', '/event-reminders', 'event-reminder.find'),
    route.resident('POST', '/event-reminders', 'event-reminder.create'),
    route.resident('DELETE', '/event-reminders/:documentId', 'event-reminder.delete'),
  ],
};
