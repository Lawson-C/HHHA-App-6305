import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/supabase';

/** Normalized error for every failed API call (Strapi 5 error shape, or a network failure). */
export class ApiError extends Error {
  status: number;
  name: string;
  details: unknown;

  constructor(status: number, name: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.name = name;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Query;
  /** JSON body; wrapped as `{ data: body }` per Strapi convention. */
  body?: unknown;
  /** Multipart body (uploads). Sent as-is. */
  form?: FormData;
  /** Explicit token; otherwise the current Supabase session is used. */
  token?: string | null;
};

export function buildQuery(query: Query = {}): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Resolve a Strapi-relative upload path ("/uploads/x.jpg") to an absolute URL. */
export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${env.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Typed fetch wrapper for the Strapi REST API. Attaches the Supabase access token when the
 * user is signed in. Screens never call `fetch` directly; they go through `src/lib/api`.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, form } = options;
  const token = options.token !== undefined ? options.token : await getAccessToken();

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/api${path}${buildQuery(query)}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify({ data: body }) : undefined),
    });
  } catch (error) {
    throw new ApiError(
      0,
      'NetworkError',
      "Couldn't reach the server. Check your connection and try again.",
      error,
    );
  }

  if (response.status === 204) return undefined as T;

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page); handled below.
  }

  if (!response.ok) {
    const err = (json as { error?: { name?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      response.status,
      err?.name ?? 'ApiError',
      err?.message ?? `Request failed (${response.status})`,
      err?.details,
    );
  }

  return json as T;
}
