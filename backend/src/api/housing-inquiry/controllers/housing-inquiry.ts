import { errors } from '@strapi/utils';
import { UID, docs } from '../../../utils/uids';
import {
  Validator,
  cleanText,
  paginationMeta,
  parsePagination,
  readBodyData,
} from '../../../utils/validation';
import {
  collectFiles,
  fileUrl,
  removeUploadedFiles,
  uploadFiles,
  validateFiles,
} from '../../../utils/uploads';

const STATUSES = ['new', 'in_progress', 'closed'];
const POPULATE = {
  housingResource: { fields: ['documentId', 'title', 'category'] },
  // `fields` can't name private attributes under strictParams, so populate the whole profile.
  profile: true,
  attachments: true,
};

const isAdmin = (ctx: any) => ctx.state.profile?.role === 'admin';

/** Owners see their inquiry; admins also see who sent it (contact details) and adminNotes. */
async function serialize(inquiry: any, admin: boolean, withAttachmentUrls: boolean) {
  const attachments = await Promise.all(
    (inquiry.attachments ?? []).map(async (file: any) => ({
      id: file.id,
      name: file.name,
      mime: file.mime,
      sizeKb: file.size,
      // Signed and short-lived when the upload provider is private (see config/plugins.ts).
      ...(withAttachmentUrls ? { url: await fileUrl(file) } : {}),
    })),
  );
  const data: Record<string, unknown> = {
    documentId: inquiry.documentId,
    message: inquiry.message,
    preferredContact: inquiry.preferredContact,
    status: inquiry.status,
    housingResource: inquiry.housingResource
      ? {
          documentId: inquiry.housingResource.documentId,
          title: inquiry.housingResource.title,
          category: inquiry.housingResource.category,
        }
      : null,
    attachments,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };
  if (admin) {
    data.adminNotes = inquiry.adminNotes ?? null;
    data.profile = inquiry.profile
      ? {
          documentId: inquiry.profile.documentId,
          fullName: inquiry.profile.fullName,
          email: inquiry.profile.email ?? null,
          phone: inquiry.profile.phone ?? null,
        }
      : null;
  }
  return data;
}

export default {
  /** Residents: their own inquiries. Admins: all (optional ?status=new). */
  async find(ctx: any) {
    const admin = isAdmin(ctx);
    const { page, pageSize, start } = parsePagination(ctx.query);
    const filters: Record<string, unknown> = admin
      ? {}
      : { profile: { documentId: ctx.state.profile.documentId } };
    if (ctx.query.status !== undefined) {
      if (!STATUSES.includes(String(ctx.query.status))) {
        throw new errors.ValidationError('Unknown status');
      }
      filters.status = ctx.query.status;
    }
    const [results, total] = await Promise.all([
      docs(UID.housingInquiry).findMany({
        filters,
        populate: POPULATE,
        sort: [{ createdAt: 'desc' }, { id: 'desc' }],
        start,
        limit: pageSize,
      }),
      docs(UID.housingInquiry).count({ filters }),
    ]);
    return {
      data: await Promise.all(results.map((r: any) => serialize(r, admin, false))),
      meta: paginationMeta(page, pageSize, total),
    };
  },

  /** Owner or admin; anyone else gets 404. Attachment URLs are included here only. */
  async findOne(ctx: any) {
    const inquiry = await docs(UID.housingInquiry).findOne({
      documentId: ctx.params.documentId,
      populate: POPULATE,
    });
    const admin = isAdmin(ctx);
    if (!inquiry || (!admin && inquiry.profile?.documentId !== ctx.state.profile.documentId)) {
      throw new errors.NotFoundError('Inquiry not found');
    }
    return { data: await serialize(inquiry, admin, true) };
  },

  /** Multipart: `data` JSON { housingResource, message, preferredContact } + `files.attachments`. */
  async create(ctx: any) {
    const body = readBodyData(ctx);
    const v = new Validator();
    const message = cleanText(body.message);
    if (!message) v.add('message', 'Message is required');
    else if (message.length > 4000) v.add('message', 'Message must be 4000 characters or fewer');
    if (!['email', 'phone'].includes(body.preferredContact as string)) {
      v.add('preferredContact', 'Choose email or phone');
    }
    const resourceId = typeof body.housingResource === 'string' ? body.housingResource : '';
    if (!resourceId) v.add('housingResource', 'housingResource is required');
    v.throwIfAny();

    const resource = await docs(UID.housingResource).findOne({
      documentId: resourceId,
      status: 'published',
    });
    if (!resource) throw new errors.NotFoundError('Housing resource not found');
    if (resource.acceptsInquiries === false) {
      throw new errors.ValidationError('This resource does not accept inquiries');
    }

    const files = collectFiles(ctx, 'attachments');
    if (files.length && resource.inquiryAllowsAttachments === false) {
      throw new errors.ValidationError('This resource does not accept attachments', {
        errors: [
          {
            path: ['attachments'],
            message: 'Attachments are not accepted',
            name: 'ValidationError',
          },
        ],
      });
    }
    await validateFiles(files, {
      field: 'attachments',
      maxFiles: 5,
      maxBytes: 10 * 1024 * 1024,
      kinds: ['pdf', 'jpeg', 'png', 'heic'],
      // Attachments are private (owner + admins), so HEIC is kept as-is; other images are cleaned.
      stripMetadata: false,
    });

    const uploaded = await uploadFiles(files);
    let inquiry;
    try {
      inquiry = await docs(UID.housingInquiry).create({
        data: {
          profile: ctx.state.profile.documentId, // from the token, never the body
          housingResource: resource.documentId,
          message,
          preferredContact: body.preferredContact,
          status: 'new',
          attachments: uploaded.map((file) => file.id),
        },
        populate: POPULATE,
      });
    } catch (error) {
      await removeUploadedFiles(uploaded);
      throw error;
    }
    ctx.status = 201;
    return { data: await serialize(inquiry, false, true) };
  },

  /** Admin: update `status` and/or `adminNotes` only. */
  async update(ctx: any) {
    const existing = await docs(UID.housingInquiry).findOne({ documentId: ctx.params.documentId });
    if (!existing) throw new errors.NotFoundError('Inquiry not found');
    const body = readBodyData(ctx);
    const data: Record<string, unknown> = {};
    const v = new Validator();
    if ('status' in body) {
      if (STATUSES.includes(body.status as string)) data.status = body.status;
      else v.add('status', 'status must be new, in_progress or closed');
    }
    if ('adminNotes' in body)
      data.adminNotes = body.adminNotes == null ? null : cleanText(body.adminNotes);
    v.throwIfAny();
    const updated = await docs(UID.housingInquiry).update({
      documentId: existing.documentId,
      data,
      populate: POPULATE,
    });
    return { data: await serialize(updated, true, true) };
  },
};
