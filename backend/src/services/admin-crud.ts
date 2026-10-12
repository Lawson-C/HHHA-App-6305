import { errors } from '@strapi/utils';
import { docs, type AppUid } from '../utils/uids';
import { readBodyData } from '../utils/validation';
import { logAdminAction, diff, type AdminAction } from './activity-log';

type CrudOptions = {
  uid: AppUid;
  /** Writable attributes. Anything else in the body is ignored. */
  fields: string[];
  draftAndPublish: boolean;
  log: { create: AdminAction; update: AdminAction; delete: AdminAction };
  /** Throw a ValidationError for cross-field rules (required/enum/length come from the schema). */
  validate?: (data: Record<string, any>, existing: Record<string, any> | null) => void;
  serialize: (doc: any) => Promise<any> | any;
  populate?: unknown;
};

const pick = (data: Record<string, unknown>, fields: string[]) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key)));

/**
 * Admin-only create / update / delete for staff-managed content (routes use auth:false +
 * global::is-admin). Writes are published immediately and every change is logged with the
 * acting admin's profile.
 */
export function adminCrud(options: CrudOptions) {
  const status = options.draftAndPublish ? { status: 'published' } : {};
  const findEditable = (documentId: string) =>
    docs(options.uid).findOne({
      documentId,
      ...(options.draftAndPublish ? { status: 'draft' } : {}),
      populate: options.populate,
    });

  return {
    async create(ctx: any) {
      const data = pick(readBodyData(ctx), options.fields);
      options.validate?.(data, null);
      const doc = await docs(options.uid).create({ data, ...status, populate: options.populate });
      await logAdminAction({
        actor: ctx.state.profile.documentId,
        action: options.log.create,
        targetType: options.uid,
        targetId: doc.documentId,
        details: { operation: 'create', title: doc.title ?? null },
      });
      ctx.status = 201;
      return { data: await options.serialize(doc) };
    },

    async update(ctx: any) {
      const documentId: string = ctx.params.id ?? ctx.params.documentId;
      const existing = await findEditable(documentId);
      if (!existing) throw new errors.NotFoundError('Not found');
      const data = pick(readBodyData(ctx), options.fields);
      options.validate?.(data, existing);
      const doc = await docs(options.uid).update({
        documentId,
        data,
        ...status,
        populate: options.populate,
      });
      await logAdminAction({
        actor: ctx.state.profile.documentId,
        action: options.log.update,
        targetType: options.uid,
        targetId: documentId,
        details: { operation: 'update', changes: diff(existing, doc, Object.keys(data)) },
      });
      return { data: await options.serialize(doc) };
    },

    async delete(ctx: any) {
      const documentId: string = ctx.params.id ?? ctx.params.documentId;
      const existing = await findEditable(documentId);
      if (!existing) throw new errors.NotFoundError('Not found');
      await docs(options.uid).delete({ documentId });
      await logAdminAction({
        actor: ctx.state.profile.documentId,
        action: options.log.delete,
        targetType: options.uid,
        targetId: documentId,
        details: { operation: 'delete', title: existing.title ?? null },
      });
      ctx.status = 204;
      ctx.body = null;
    },
  };
}
