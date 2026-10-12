// jest.mock calls below are hoisted above this import by babel-jest.
import { absoluteUrl, ApiError, apiRequest, buildQuery } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({
  env: { apiUrl: 'https://api.test', hasApi: true, hasSupabase: true },
  isDemoData: false,
  isDemoAuth: false,
}));

const mockGetAccessToken = jest.fn<Promise<string | null>, []>();
jest.mock('@/lib/supabase', () => ({ getAccessToken: () => mockGetAccessToken() }));

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('apiRequest', () => {
  beforeEach(() => mockGetAccessToken.mockReset());

  it('sends the Supabase access token when signed in', async () => {
    mockGetAccessToken.mockResolvedValue('jwt-123');
    const fetchMock = mockFetch(200, { data: { ok: true } });
    await apiRequest('/me');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
  });

  it('sends no Authorization header when signed out', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const fetchMock = mockFetch(200, { data: [] });
    await apiRequest('/events');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('wraps JSON bodies in { data } (Strapi convention)', async () => {
    mockGetAccessToken.mockResolvedValue('jwt');
    const fetchMock = mockFetch(200, { data: {} });
    await apiRequest('/me', { method: 'PUT', body: { fullName: 'Denise' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ data: { fullName: 'Denise' } });
  });

  it('normalizes Strapi errors', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    mockFetch(403, {
      data: null,
      error: { status: 403, name: 'PolicyError', message: 'Account suspended' },
    });
    const error = await apiRequest<never>('/me').catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Account suspended');
    expect(error.isForbidden).toBe(true);
  });

  it('turns network failures into status 0', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const error = await apiRequest<never>('/events').catch((e: unknown) => e as ApiError);
    expect(error.isNetwork).toBe(true);
  });
});

describe('helpers', () => {
  it('builds Strapi query strings and skips empty values', () => {
    expect(buildQuery({ 'filters[category][$eq]': 'health', q: undefined, empty: '' })).toBe(
      '?filters%5Bcategory%5D%5B%24eq%5D=health',
    );
  });

  it('resolves upload paths against the API URL', () => {
    expect(absoluteUrl('/uploads/a.jpg')).toBe('https://api.test/uploads/a.jpg');
    expect(absoluteUrl('https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg');
    expect(absoluteUrl(null)).toBeNull();
  });
});
