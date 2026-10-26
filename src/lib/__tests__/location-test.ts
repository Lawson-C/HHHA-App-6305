import boundaries from '@/data/neighborhoods.json';
import { findNeighborhood } from '@/lib/location';

/**
 * Some point inside the polygon: the first midpoint between two vertices that lands in any
 * neighborhood. The test then checks it's the *right* one (catches swapped ids or overlaps).
 */
function interiorPoint(ring: number[][]): [number, number] | null {
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 2; j < ring.length; j++) {
      const lng = (ring[i]![0]! + ring[j]![0]!) / 2;
      const lat = (ring[i]![1]! + ring[j]![1]!) / 2;
      if (findNeighborhood(lat, lng)) return [lat, lng];
    }
  }
  return null;
}

describe('findNeighborhood', () => {
  it('has official boundaries for all 11 neighborhoods', () => {
    expect(boundaries.features.map((f) => f.properties.id).sort()).toEqual([
      'bankhead',
      'center_hill',
      'dixie_hills',
      'english_avenue',
      'georgia_tech',
      'harvel_homes',
      'hunter_hills',
      'knight_park',
      'vine_city',
      'washington_park',
      'west_lake',
    ]);
  });

  it.each(boundaries.features.map((f) => [f.properties.id, f] as const))(
    'finds %s from a point inside it',
    (id, feature) => {
      const geometry = feature.geometry as {
        type: string;
        coordinates: number[][][] | number[][][][];
      };
      const ring = (
        geometry.type === 'Polygon'
          ? geometry.coordinates[0]
          : (geometry.coordinates as number[][][][])[0]![0]
      ) as number[][];
      const point = interiorPoint(ring);
      expect(point).not.toBeNull();
      expect(findNeighborhood(point![0], point![1])).toBe(id);
    },
  );

  it('recognizes landmarks', () => {
    // Georgia Tech campus green (Tech Tower area)
    expect(findNeighborhood(33.7724, -84.3947)).toBe('georgia_tech');
  });

  it('returns null outside District 3', () => {
    expect(findNeighborhood(33.749, -84.388)).toBeNull(); // Downtown / State Capitol
    expect(findNeighborhood(40.7128, -74.006)).toBeNull(); // New York
  });
});
