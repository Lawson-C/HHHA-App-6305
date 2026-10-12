import { errors } from '@strapi/utils';

export const E164_RE = /^\+[1-9]\d{1,14}$/;

export type FieldError = { path: string[]; message: string; name: 'ValidationError' };

/** Collects field errors and throws one Strapi ValidationError (400) with details.errors[]. */
export class Validator {
  errors: FieldError[] = [];

  add(path: string, message: string) {
    this.errors.push({ path: path.split('.'), message, name: 'ValidationError' });
  }

  throwIfAny(message = 'Invalid request') {
    if (this.errors.length) {
      throw new errors.ValidationError(
        this.errors.length === 1 ? this.errors[0].message : message,
        { errors: this.errors },
      );
    }
  }
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Reads `{ data: {...} }` from a JSON body, or the `data` field of a multipart body. */
export function readBodyData(ctx: any): Record<string, unknown> {
  const body = ctx.request.body ?? {};
  let data = body.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new errors.ValidationError('`data` must be valid JSON');
    }
  }
  if (data === undefined) {
    throw new errors.ValidationError('Missing "data" payload in the request body');
  }
  if (!isPlainObject(data)) {
    throw new errors.ValidationError('`data` must be an object');
  }
  return data;
}

/** Plain-text sanitization for user-entered text: strips control chars and HTML tags. */
export function cleanText(value: unknown): string {
  return (
    String(value ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/<[^>]*>/g, '')
      .trim()
  );
}

export const isIsoDate = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));

export function parsePagination(query: any, defaults = { pageSize: 25, max: 100 }) {
  const pagination = (query?.pagination ?? {}) as Record<string, unknown>;
  const rawPage = pagination.page ?? query?.page;
  const rawSize = pagination.pageSize ?? query?.pageSize;
  const page = Math.max(1, Number.parseInt(String(rawPage ?? 1), 10) || 1);
  const pageSize = Math.min(
    defaults.max,
    Math.max(1, Number.parseInt(String(rawSize ?? defaults.pageSize), 10) || defaults.pageSize),
  );
  return { page, pageSize, start: (page - 1) * pageSize };
}

export const paginationMeta = (page: number, pageSize: number, total: number) => ({
  pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total },
});
