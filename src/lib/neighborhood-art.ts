import type { Neighborhood } from '@/lib/api/types';

/** Dark-tone neighborhood map art exported from the Figma "Neighborhood Art" component set. */
const art: Record<Neighborhood | 'district_3', number> = {
  english_avenue: require('@/assets/art/english-avenue.jpg'),
  vine_city: require('@/assets/art/vine-city.jpg'),
  hunter_hills: require('@/assets/art/hunter-hills.jpg'),
  washington_park: require('@/assets/art/washington-park.jpg'),
  bankhead: require('@/assets/art/bankhead.jpg'),
  knight_park: require('@/assets/art/knight-park.jpg'),
  dixie_hills: require('@/assets/art/dixie-hills.jpg'),
  west_lake: require('@/assets/art/west-lake.jpg'),
  center_hill: require('@/assets/art/center-hill.jpg'),
  harvel_homes: require('@/assets/art/harvel-homes.jpg'),
  georgia_tech: require('@/assets/art/georgia-tech.jpg'),
  district_3: require('@/assets/art/district-3.jpg'),
};

export function neighborhoodArt(neighborhood: Neighborhood | null | undefined) {
  return art[neighborhood ?? 'district_3'];
}
