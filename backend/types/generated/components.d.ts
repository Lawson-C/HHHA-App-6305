import type { Schema, Struct } from '@strapi/strapi';

export interface NotificationPreferences extends Struct.ComponentSchema {
  collectionName: 'components_notification_preferences';
  info: {
    description: 'Opt-in flags per notification category. Emergency alerts are always on.';
    displayName: 'Notification preferences';
    icon: 'bell';
  };
  attributes: {
    communityAnnouncements: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<true>;
    healthWarnings: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<true>;
    meetingReminders: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<true>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'notification.preferences': NotificationPreferences;
    }
  }
}
