import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { UID, docs } from '../../../utils/uids';
import { adminCrud } from '../../../services/admin-crud';
import { fileUrl } from '../../../utils/uploads';

const FIELDS = [
  'title',
  'address',
  'neighborhood',
  'rentLabel',
  'bedrooms',
  'image',
  'url',
  'availableFrom',
];

/** Flattens the `image` media relation to `imageUrl` (string | null). */
async function withImageUrls(listings: any[]) {
  if (!listings.length) return listings;
  const withImages = await docs(UID.housingListing).findMany({
    filters: { documentId: { $in: listings.map((l) => l.documentId) } },
    fields: ['documentId'],
    populate: { image: true },
  });
  const urls = new Map<string, string | null>();
  for (const listing of withImages) urls.set(listing.documentId, await fileUrl(listing.image));
  return listings.map(({ image: _image, ...listing }) => ({
    ...listing,
    imageUrl: urls.get(listing.documentId) ?? null,
  }));
}

const crud = adminCrud({
  uid: UID.housingListing,
  fields: FIELDS,
  draftAndPublish: true,
  log: {
    create: 'housing_resource_changed',
    update: 'housing_resource_changed',
    delete: 'housing_resource_changed',
  },
  serialize: async (listing: any) => (await withImageUrls([listing]))[0],
});

export default factories.createCoreController(UID.housingListing as any, () => ({
  /** Open listings, newest first unless `sort` is given. */
  async find(ctx: any) {
    if (!ctx.query.sort) ctx.query.sort = ['createdAt:desc'];
    const response: any = await super.find(ctx);
    return { ...response, data: await withImageUrls(response.data) };
  },
  async findOne(ctx: any) {
    const response: any = await super.findOne(ctx);
    if (!response?.data) throw new errors.NotFoundError('Not found');
    return response && { ...response, data: (await withImageUrls([response.data]))[0] };
  },
  create: crud.create,
  update: crud.update,
  delete: crud.delete,
}));
