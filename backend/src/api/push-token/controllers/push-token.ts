import { UID, dbq, docs } from '../../../utils/uids';
import { Validator, readBodyData } from '../../../utils/validation';

const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

/**
 * Push tokens (guest or signed in). The token string itself is the device secret: whoever
 * holds it may register or unregister it. A signed-in caller links the token to their
 * profile; a guest call unlinks it (the device is now used signed out).
 */
export default {
  async register(ctx: any) {
    const body = readBodyData(ctx);
    const v = new Validator();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!TOKEN_RE.test(token)) v.add('token', 'token must be an Expo push token');
    if (body.platform !== undefined && !['ios', 'android'].includes(body.platform as string)) {
      v.add('platform', 'platform must be ios or android');
    }
    v.throwIfAny();

    const data = {
      token,
      platform: (body.platform as string) ?? null,
      profile: ctx.state.profile?.documentId ?? null,
      lastRegisteredAt: new Date().toISOString(),
    };
    const existing = await docs(UID.pushToken).findFirst({ filters: { token } });
    let saved;
    if (existing) {
      saved = await docs(UID.pushToken).update({ documentId: existing.documentId, data });
    } else {
      try {
        saved = await docs(UID.pushToken).create({ data });
        ctx.status = 201;
      } catch (error) {
        // Lost a race on the unique token index: update the row that won.
        const winner = await docs(UID.pushToken).findFirst({ filters: { token } });
        if (!winner) throw error;
        saved = await docs(UID.pushToken).update({ documentId: winner.documentId, data });
      }
    }
    return {
      data: {
        token: saved.token,
        platform: saved.platform ?? null,
        lastRegisteredAt: saved.lastRegisteredAt,
        linkedToProfile: !!ctx.state.profile,
      },
    };
  },

  /** Idempotent: 204 whether or not the token was registered. */
  async unregister(ctx: any) {
    const token = String(ctx.params.token ?? '');
    if (TOKEN_RE.test(token)) {
      await dbq(UID.pushToken).deleteMany({ where: { token } });
    }
    ctx.status = 204;
    ctx.body = null;
  },
};
