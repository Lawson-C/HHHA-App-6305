import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { UID } from '../../../utils/uids';
import { adminCrud } from '../../../services/admin-crud';

const FIELDS = [
  'title',
  'category',
  'highlights',
  'summary',
  'eligibility',
  'requiredMaterials',
  'contactName',
  'contactPhone',
  'contactEmail',
  'website',
  'acceptsInquiries',
  'inquiryAllowsAttachments',
];

/** JSON fields always come back as arrays so the app can render "not available" for []. */
const withArrays = (resource: any) =>
  resource && {
    ...resource,
    highlights: Array.isArray(resource.highlights) ? resource.highlights : [],
    eligibility: Array.isArray(resource.eligibility) ? resource.eligibility : [],
    requiredMaterials: Array.isArray(resource.requiredMaterials) ? resource.requiredMaterials : [],
  };

const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length <= 500);

const crud = adminCrud({
  uid: UID.housingResource,
  fields: FIELDS,
  draftAndPublish: true,
  log: {
    create: 'housing_resource_changed',
    update: 'housing_resource_changed',
    delete: 'housing_resource_changed',
  },
  serialize: withArrays,
  validate(data) {
    const fieldErrors = [];
    for (const key of ['eligibility', 'requiredMaterials']) {
      if (key in data && data[key] !== null && !isStringArray(data[key])) {
        fieldErrors.push({
          path: [key],
          message: `${key} must be a list of strings`,
          name: 'ValidationError',
        });
      }
    }
    if ('highlights' in data && data.highlights !== null) {
      const ok =
        Array.isArray(data.highlights) &&
        data.highlights.length <= 3 &&
        data.highlights.every(
          (h: any) => h && typeof h.value === 'string' && typeof h.label === 'string',
        );
      if (!ok) {
        fieldErrors.push({
          path: ['highlights'],
          message: 'highlights must be up to 3 { value, label } items',
          name: 'ValidationError',
        });
      }
    }
    if (fieldErrors.length)
      throw new errors.ValidationError(fieldErrors[0].message, { errors: fieldErrors });
  },
});

export default factories.createCoreController(UID.housingResource as any, () => ({
  async find(ctx: any) {
    if (!ctx.query.sort) ctx.query.sort = ['title:asc'];
    const response: any = await super.find(ctx);
    return { ...response, data: response.data.map(withArrays) };
  },
  async findOne(ctx: any) {
    const response: any = await super.findOne(ctx);
    if (!response?.data) throw new errors.NotFoundError('Not found');
    return response && { ...response, data: withArrays(response.data) };
  },
  create: crud.create,
  update: crud.update,
  delete: crud.delete,
}));
