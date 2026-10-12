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
import { haversineKm } from '../../../services/environment';
import { logAdminAction, diff } from '../../../services/activity-log';
import { isBlocked } from '../../../utils/account-status';

const CATEGORIES = [
  'illegal_dumping',
  'vacant_lot',
  'abandoned_building',
  'standing_water',
  'air_odor',
  'other',
];
const STATUSES = ['submitted', 'under_review', 'reported_to_city', 'resolved', 'removed'];
export const ACTIVE_STATUSES = ['submitted', 'under_review', 'reported_to_city'];

const DUPLICATE_RADIUS_KM = 0.05; // Q-013 default: same category within 50 m...
const DUPLICATE_WINDOW_DAYS = 30; // ...in the last 30 days → warn, but allow.
const DEFAULT_RADIUS_KM = 2;
const MAX_RADIUS_KM = 50;

const POPULATE = { images: true, reporter: { fields: ['documentId', 'fullName'] } };

const isAdmin = (ctx: any) => {
  const profile = ctx.state.profile;
  return !!profile && profile.role === 'admin' && !isBlocked(profile);
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/**
 * Response shape. `audience`:
 * - public: never `reporter`, `keepNamePrivate` or `resolutionNote`;
 * - owner:  + keepNamePrivate, resolutionNote, resolvedAt;
 * - admin:  + reporter { documentId, fullName }.
 */
async function serialize(report: any, audience: 'public' | 'owner' | 'admin') {
  const imageUrls = (
    await Promise.all((report.images ?? []).map((image: any) => fileUrl(image)))
  ).filter(Boolean);
  const base: Record<string, unknown> = {
    id: report.id,
    documentId: report.documentId,
    category: report.category,
    description: report.description ?? null,
    latitude: num(report.latitude),
    longitude: num(report.longitude),
    address: report.address ?? null,
    status: report.status,
    statusHistory: Array.isArray(report.statusHistory) ? report.statusHistory : [],
    imageUrls,
    resolvedAt: report.resolvedAt ?? null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
  if (report.distanceKm !== undefined)
    base.distanceKm = Math.round(report.distanceKm * 1000) / 1000;
  if (audience === 'public') return base;
  base.keepNamePrivate = report.keepNamePrivate !== false;
  base.resolutionNote = report.resolutionNote ?? null;
  if (audience === 'admin') {
    base.reporter = report.reporter
      ? { documentId: report.reporter.documentId, fullName: report.reporter.fullName }
      : null;
  }
  return base;
}

const listValues = (value: unknown) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((v) => String(v).trim())
    .filter(Boolean);

function parseNear(query: any) {
  if (query.near === undefined) return null;
  const [lat, lng] = String(query.near).split(',').map(Number);
  const radiusKm = query.radiusKm === undefined ? DEFAULT_RADIUS_KM : Number(query.radiusKm);
  const v = new Validator();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    v.add('near', 'near must be "lat,lng"');
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    v.add('radiusKm', `radiusKm must be between 0 and ${MAX_RADIUS_KM}`);
  }
  v.throwIfAny();
  return { lat, lng, radiusKm };
}

/** Bounding box that contains the circle; precise distance is filtered in JS afterwards. */
const boundingBox = (lat: number, lng: number, radiusKm: number) => {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
};

export default {
  /**
   * GET /api/blight-reports (public). Active reports only, unless an admin asks for other
   * statuses. Params: category, status (comma-separated), near=lat,lng, radiusKm,
   * pagination[page], pagination[pageSize]. With `near`, results are sorted by distance.
   */
  async find(ctx: any) {
    const query = ctx.query ?? {};
    const admin = isAdmin(ctx);
    const v = new Validator();

    const categories = listValues(query.category);
    if (categories.some((c) => !CATEGORIES.includes(c))) v.add('category', 'Unknown category');
    let statuses = listValues(query.status);
    if (statuses.some((s) => !STATUSES.includes(s))) v.add('status', 'Unknown status');
    v.throwIfAny();
    const allowed = admin ? STATUSES : ACTIVE_STATUSES;
    statuses = statuses.length ? statuses.filter((s) => allowed.includes(s)) : ACTIVE_STATUSES;

    const near = parseNear(query);
    const { page, pageSize, start } = parsePagination(query);
    const filters: Record<string, unknown> = {
      status: { $in: statuses.length ? statuses : ['__none__'] },
    };
    if (categories.length) filters.category = { $in: categories };

    let results: any[];
    let total: number;
    if (near) {
      const box = boundingBox(near.lat, near.lng, near.radiusKm);
      filters.latitude = { $gte: box.minLat, $lte: box.maxLat };
      filters.longitude = { $gte: box.minLng, $lte: box.maxLng };
      const candidates = await docs(UID.blightReport).findMany({
        filters,
        fields: ['latitude', 'longitude'],
      });
      const inRange = candidates
        .map((r: any) => ({
          documentId: r.documentId,
          distanceKm: haversineKm(near.lat, near.lng, Number(r.latitude), Number(r.longitude)),
        }))
        .filter((r: any) => r.distanceKm <= near.radiusKm)
        .sort((a: any, b: any) => a.distanceKm - b.distanceKm);
      total = inRange.length;
      const pageItems = inRange.slice(start, start + pageSize);
      const full = await docs(UID.blightReport).findMany({
        filters: { documentId: { $in: pageItems.map((r: any) => r.documentId) } },
        populate: POPULATE,
      });
      const byId = new Map(full.map((r: any) => [r.documentId, r]));
      results = pageItems
        .map((item: any) => ({
          ...(byId.get(item.documentId) as any),
          distanceKm: item.distanceKm,
        }))
        .filter((r: any) => r.documentId);
    } else {
      [results, total] = await Promise.all([
        docs(UID.blightReport).findMany({
          filters,
          sort: [{ createdAt: 'desc' }, { id: 'desc' }],
          populate: POPULATE,
          start,
          limit: pageSize,
        }),
        docs(UID.blightReport).count({ filters }),
      ]);
    }

    return {
      data: await Promise.all(results.map((r) => serialize(r, admin ? 'admin' : 'public'))),
      meta: paginationMeta(page, pageSize, total),
    };
  },

  /** GET /api/blight-reports/:documentId. Public: active only. Owner and admins: any status. */
  async findOne(ctx: any) {
    const report = await docs(UID.blightReport).findOne({
      documentId: ctx.params.documentId,
      populate: POPULATE,
    });
    if (!report) throw new errors.NotFoundError('Report not found');
    const admin = isAdmin(ctx);
    const owner =
      !!ctx.state.profile &&
      !isBlocked(ctx.state.profile) &&
      report.reporter?.documentId === ctx.state.profile.documentId;
    if (!admin && !owner && !ACTIVE_STATUSES.includes(report.status)) {
      throw new errors.NotFoundError('Report not found');
    }
    return { data: await serialize(report, admin ? 'admin' : owner ? 'owner' : 'public') };
  },

  /** GET /api/blight-reports/mine: the caller's own reports, every status, newest first. */
  async mine(ctx: any) {
    const { page, pageSize, start } = parsePagination(ctx.query);
    const filters = { reporter: { documentId: ctx.state.profile.documentId } };
    const [results, total] = await Promise.all([
      docs(UID.blightReport).findMany({
        filters,
        sort: [{ createdAt: 'desc' }, { id: 'desc' }],
        populate: POPULATE,
        start,
        limit: pageSize,
      }),
      docs(UID.blightReport).count({ filters }),
    ]);
    return {
      data: await Promise.all(results.map((r: any) => serialize(r, 'owner'))),
      meta: paginationMeta(page, pageSize, total),
    };
  },

  /**
   * POST /api/blight-reports (multipart: `data` JSON string + 1–5 `files.images`).
   * Status is forced to `submitted` and the reporter to the caller; body values are ignored.
   */
  async create(ctx: any) {
    const body = readBodyData(ctx);
    const v = new Validator();
    const bbox = strapi.config.get('hhha.district.bbox') as {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    };

    if (!CATEGORIES.includes(body.category as string)) v.add('category', 'Choose a report type');
    const description = body.description == null ? '' : cleanText(body.description);
    if (description.length > 2000)
      v.add('description', 'Description must be 2000 characters or fewer');
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (
      body.latitude == null ||
      body.longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      v.add('latitude', 'Location is required');
    } else if (
      latitude < bbox.minLat ||
      latitude > bbox.maxLat ||
      longitude < bbox.minLng ||
      longitude > bbox.maxLng
    ) {
      v.add('latitude', 'This location is outside District 3');
    }
    const address = body.address == null ? null : cleanText(body.address).slice(0, 255) || null;
    if (body.keepNamePrivate !== undefined && typeof body.keepNamePrivate !== 'boolean') {
      v.add('keepNamePrivate', 'keepNamePrivate must be true or false');
    }
    v.throwIfAny();

    const files = collectFiles(ctx, 'images');
    await validateFiles(files, {
      field: 'images',
      minFiles: 1,
      maxFiles: 5,
      maxBytes: 10 * 1024 * 1024,
      kinds: ['jpeg', 'png', 'webp', 'heic'],
      stripMetadata: true,
    });

    // Q-013: warn about likely duplicates, but still accept the report.
    const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const box = boundingBox(latitude, longitude, DUPLICATE_RADIUS_KM);
    const nearby = await docs(UID.blightReport).findMany({
      filters: {
        category: body.category,
        status: { $in: ACTIVE_STATUSES },
        createdAt: { $gte: since },
        latitude: { $gte: box.minLat, $lte: box.maxLat },
        longitude: { $gte: box.minLng, $lte: box.maxLng },
      },
      fields: ['latitude', 'longitude'],
    });
    const possibleDuplicates = nearby
      .filter(
        (r: any) =>
          haversineKm(latitude, longitude, Number(r.latitude), Number(r.longitude)) <=
          DUPLICATE_RADIUS_KM,
      )
      .map((r: any) => r.documentId);

    const uploaded = await uploadFiles(files);
    let report;
    try {
      report = await docs(UID.blightReport).create({
        data: {
          category: body.category,
          description: description || null,
          keepNamePrivate: body.keepNamePrivate !== false,
          latitude,
          longitude,
          address,
          images: uploaded.map((file) => file.id),
          status: 'submitted', // forced; statusHistory is added by the document middleware
          reporter: ctx.state.profile.documentId, // from the token, never from the body
        },
        populate: POPULATE,
      });
    } catch (error) {
      await removeUploadedFiles(uploaded);
      throw error;
    }

    ctx.status = 201;
    return { data: await serialize(report, 'owner'), meta: { possibleDuplicates } };
  },

  /**
   * PUT /api/blight-reports/:documentId (admin). Edit, change status, resolve, or remove
   * (soft delete: status `removed`). statusHistory/resolvedAt are maintained server-side.
   */
  async update(ctx: any) {
    const { documentId } = ctx.params;
    const existing = await docs(UID.blightReport).findOne({ documentId, populate: POPULATE });
    if (!existing) throw new errors.NotFoundError('Report not found');

    const body = readBodyData(ctx);
    const v = new Validator();
    const data: Record<string, unknown> = {};
    if ('category' in body) {
      if (CATEGORIES.includes(body.category as string)) data.category = body.category;
      else v.add('category', 'Unknown category');
    }
    if ('status' in body) {
      if (STATUSES.includes(body.status as string)) data.status = body.status;
      else v.add('status', 'Unknown status');
    }
    if ('description' in body) {
      const description = body.description == null ? '' : cleanText(body.description);
      if (description.length > 2000)
        v.add('description', 'Description must be 2000 characters or fewer');
      data.description = description || null;
    }
    if ('address' in body)
      data.address = body.address == null ? null : cleanText(body.address).slice(0, 255);
    if ('resolutionNote' in body) {
      data.resolutionNote =
        body.resolutionNote == null ? null : cleanText(body.resolutionNote).slice(0, 2000);
    }
    for (const key of ['latitude', 'longitude'] as const) {
      if (key in body) {
        const value = Number(body[key]);
        if (!Number.isFinite(value)) v.add(key, `${key} must be a number`);
        else data[key] = value;
      }
    }
    if ('keepNamePrivate' in body) {
      if (typeof body.keepNamePrivate === 'boolean') data.keepNamePrivate = body.keepNamePrivate;
      else v.add('keepNamePrivate', 'keepNamePrivate must be true or false');
    }
    v.throwIfAny();

    const updated = await docs(UID.blightReport).update({ documentId, data, populate: POPULATE });
    const statusChanged = data.status !== undefined && data.status !== existing.status;
    await logAdminAction({
      actor: ctx.state.profile.documentId,
      action: statusChanged
        ? data.status === 'removed'
          ? 'report_removed'
          : 'report_status_changed'
        : 'report_edited',
      targetType: UID.blightReport,
      targetId: documentId,
      details: { changes: diff(existing, updated, Object.keys(data)) },
    });
    return { data: await serialize(updated, 'admin') };
  },
};
