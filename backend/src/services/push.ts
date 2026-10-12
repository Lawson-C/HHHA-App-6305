import type { Core } from '@strapi/strapi';
import { UID, dbq, docs } from '../utils/uids';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
};

const BATCH_SIZE = 100;

/** Which preference flag controls each category. Emergency has none: always delivered. */
export const CATEGORY_PREFERENCE: Record<string, string | null> = {
  emergency: null,
  health_warning: 'healthWarnings',
  community_announcement: 'communityAnnouncements',
  meeting_reminder: 'meetingReminders',
};

const pushConfig = (strapi: Core.Strapi) =>
  strapi.config.get('hhha.push', { enabled: false }) as {
    enabled: boolean;
    expoAccessToken?: string;
    sendUrl: string;
  };

/**
 * Sends messages to the Expo Push API in batches of ≤ 100 and removes tokens Expo reports as
 * `DeviceNotRegistered`. No-ops (returns 0 sent) when PUSH_ENABLED is false, so dev and tests
 * never touch the network. Receipt polling is a follow-up (tickets only for now).
 */
export async function sendPushMessages(strapi: Core.Strapi, messages: PushMessage[]) {
  const config = pushConfig(strapi);
  if (!config.enabled || messages.length === 0) {
    return { attempted: 0, ok: 0, removedTokens: 0 };
  }

  let ok = 0;
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch(config.sendUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(config.expoAccessToken ? { Authorization: `Bearer ${config.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        strapi.log.warn(`Expo push batch failed with HTTP ${response.status}`);
        continue;
      }
      const payload: any = await response.json();
      const tickets: any[] = Array.isArray(payload?.data) ? payload.data : [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') ok += 1;
        else if (ticket?.details?.error === 'DeviceNotRegistered') deadTokens.push(batch[index].to);
      });
    } catch (error) {
      strapi.log.warn(`Expo push batch failed: ${(error as Error).message}`);
    }
  }

  if (deadTokens.length) {
    await dbq(UID.pushToken).deleteMany({ where: { token: { $in: deadTokens } } });
  }
  return { attempted: messages.length, ok, removedTokens: deadTokens.length };
}

/** Push tokens that should receive a notification of this category. */
export async function selectRecipientTokens(category: string): Promise<string[]> {
  const tokens = await dbq(UID.pushToken).findMany({
    select: ['token'],
    populate: { profile: { select: ['status'], populate: { notificationPreferences: true } } },
  });
  const preference = CATEGORY_PREFERENCE[category];
  return tokens
    .filter((row: any) => {
      if (category === 'emergency') return true; // everyone, guests included (Q-005)
      const profile = row.profile;
      if (!profile || profile.status === 'banned') return false;
      return preference ? profile.notificationPreferences?.[preference] !== false : false;
    })
    .map((row: any) => row.token as string);
}

/**
 * Fan-out for a stored notification: picks recipients by preference (emergency → all
 * tokens), sends through Expo, then stores sentAt + recipientCount. Returns the count of
 * targeted devices (also when push is disabled, so admins see who would be reached).
 */
export async function deliverNotification(strapi: Core.Strapi, notification: any) {
  const tokens = await selectRecipientTokens(notification.category);
  await sendPushMessages(
    strapi,
    tokens.map((to) => ({
      to,
      title: notification.title,
      body: notification.message,
      sound: 'default',
      priority: notification.category === 'emergency' ? 'high' : 'default',
      data: {
        type: 'notification',
        documentId: notification.documentId,
        category: notification.category,
      },
    })),
  );
  const updated = await docs(UID.notification).update({
    documentId: notification.documentId,
    data: {
      recipientCount: tokens.length,
      sentAt: notification.sentAt ?? new Date().toISOString(),
    },
  });
  return { recipientCount: tokens.length, notification: updated };
}
