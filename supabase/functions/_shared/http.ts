/** Small helpers shared by the Edge Function entry points. */
import { timingSafeEqual } from './sanity.ts';

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** pg_cron calls send `x-cron-secret: <CRON_SECRET>` (see migrations/*_cron.sql). */
export function isCronAuthorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const provided = req.headers.get('x-cron-secret') ?? '';
  return provided.length > 0 && timingSafeEqual(provided, secret);
}

export const envFlag = (value: string | undefined) =>
  ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
