import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { UID } from '../../../utils/uids';
import { adminCrud } from '../../../services/admin-crud';

const FIELDS = [
  'title',
  'description',
  'category',
  'resourceType',
  'url',
  'body',
  'thumbnail',
  'source',
  'durationMinutes',
  'featured',
];

const crud = adminCrud({
  uid: UID.libraryResource,
  fields: FIELDS,
  draftAndPublish: true,
  log: {
    create: 'library_resource_changed',
    update: 'library_resource_changed',
    delete: 'library_resource_changed',
  },
  serialize: ({ thumbnail: _thumbnail, ...resource }: any) => resource,
  validate(data, existing) {
    const resourceType = data.resourceType ?? existing?.resourceType;
    const url = 'url' in data ? data.url : existing?.url;
    if ((resourceType === 'video' || resourceType === 'link') && !url) {
      throw new errors.ValidationError('A URL is required for videos and links', {
        errors: [
          {
            path: ['url'],
            message: 'A URL is required for videos and links',
            name: 'ValidationError',
          },
        ],
      });
    }
    if (url && !/^https?:\/\//i.test(String(url))) {
      throw new errors.ValidationError('URL must start with http:// or https://', {
        errors: [
          {
            path: ['url'],
            message: 'URL must start with http:// or https://',
            name: 'ValidationError',
          },
        ],
      });
    }
  },
});

export default factories.createCoreController(UID.libraryResource as any, () => ({
  /** Featured ("Start here") first, then newest. Standard Strapi filters apply. */
  async find(ctx: any) {
    if (!ctx.query.sort) ctx.query.sort = ['featured:desc', 'createdAt:desc'];
    return super.find(ctx);
  },
  async findOne(ctx: any) {
    const response: any = await super.findOne(ctx);
    if (!response?.data) throw new errors.NotFoundError('Not found');
    return response;
  },
  create: crud.create,
  update: crud.update,
  delete: crud.delete,
}));
