import { Validator } from '../../../utils/validation';
import { currentConditions, glance } from '../../../services/environment';

export default {
  /**
   * GET /api/environment?lat=&lng= → latest reading per category (all five, always), each
   * with `stale`. The point is only used to pick nearby readings and is never stored.
   */
  async current(ctx: any) {
    const { lat, lng } = ctx.query ?? {};
    let point: { lat: number; lng: number } | undefined;
    if (lat !== undefined || lng !== undefined) {
      const v = new Validator();
      const la = Number(lat);
      const ln = Number(lng);
      if (!Number.isFinite(la) || Math.abs(la) > 90) v.add('lat', 'lat must be a latitude');
      if (!Number.isFinite(ln) || Math.abs(ln) > 180) v.add('lng', 'lng must be a longitude');
      v.throwIfAny();
      point = { lat: la, lng: ln };
    }
    const { entries } = await currentConditions(point);
    return { data: entries };
  },

  /** GET /api/environment/glance → compact summary for the home card. */
  async glance() {
    return { data: await glance() };
  },
};
