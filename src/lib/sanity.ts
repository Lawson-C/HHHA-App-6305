/**
 * Read-only access to published Sanity content over the HTTP query API (CDN). Content is
 * public by design (docs/security.md): no token ships in the app.
 * https://www.sanity.io/docs/http-query
 */
import { ApiError } from '@/lib/api/client';
import { env } from '@/lib/env';

/** Pinned API version; bump deliberately when adopting newer GROQ behavior. */
const API_VERSION = 'v2026-10-19';

type Params = Record<string, string | number | boolean | string[] | null>;

export async function sanityQuery<T>(query: string, params: Params = {}): Promise<T> {
  const search = new URLSearchParams({ query });
  for (const [name, value] of Object.entries(params)) {
    search.set(`$${name}`, JSON.stringify(value));
  }
  const url = `https://${env.sanityProjectId}.apicdn.sanity.io/${API_VERSION}/data/query/${env.sanityDataset}?${search}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new ApiError(
      0,
      'NetworkError',
      "Couldn't reach the server. Check your connection and try again.",
      error,
    );
  }
  const json = (await response.json().catch(() => null)) as {
    result?: T;
    error?: { description?: string };
  } | null;
  if (!response.ok || !json || !('result' in json)) {
    throw new ApiError(
      response.status,
      'SanityError',
      json?.error?.description ?? `Content request failed (${response.status})`,
    );
  }
  return json.result as T;
}

type PortableTextBlock = {
  _type: string;
  style?: string;
  listItem?: string;
  children?: { text?: string }[];
};

/**
 * Library articles are Portable Text in Sanity; the app renders the same small subset as
 * Markdown-ish text (`## heading`, `- bullet`, paragraphs) through SimpleMarkdown.
 */
export function portableTextToMarkdown(
  blocks: PortableTextBlock[] | null | undefined,
): string | null {
  if (!blocks?.length) return null;
  const out: string[] = [];
  let inList = false;
  for (const block of blocks) {
    if (block._type !== 'block') continue;
    const text = (block.children ?? []).map((c) => c.text ?? '').join('');
    if (block.listItem) {
      out.push(`${inList ? '\n' : '\n\n'}- ${text}`);
      inList = true;
      continue;
    }
    inList = false;
    out.push(`\n\n${block.style === 'h2' ? '## ' : ''}${text}`);
  }
  return out.join('').trim();
}
