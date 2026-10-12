export const UID = {
  profile: 'api::profile.profile',
  blightReport: 'api::blight-report.blight-report',
  event: 'api::event.event',
  eventReminder: 'api::event-reminder.event-reminder',
  housingResource: 'api::housing-resource.housing-resource',
  housingListing: 'api::housing-listing.housing-listing',
  housingInquiry: 'api::housing-inquiry.housing-inquiry',
  notification: 'api::notification.notification',
  pushToken: 'api::push-token.push-token',
  libraryResource: 'api::library-resource.library-resource',
  environmentalSource: 'api::environmental-source.environmental-source',
  environmentalReading: 'api::environmental-reading.environmental-reading',
  adminActivityLog: 'api::admin-activity-log.admin-activity-log',
} as const;

export type AppUid = (typeof UID)[keyof typeof UID];

/**
 * Untyped Document Service handle. Our content types are not in the generated types until
 * `strapi ts:generate-types` runs, so we keep call sites loosely typed on purpose.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const docs = (uid: AppUid): any => (strapi as any).documents(uid);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dbq = (uid: string): any => (strapi as any).db.query(uid);
