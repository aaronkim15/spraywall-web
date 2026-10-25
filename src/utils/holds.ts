export type Point = { x: number; y: number };

// Ray-casting point-in-polygon. Coords are normalized (0-1).
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      (yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Shoelace area of a normalized polygon (used to break ties between stacked holds).
function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(a) / 2;
}

// When holds overlap (e.g. a small hold on a big volume), the smallest one
// under the tap wins, so you can target it instead of the volume beneath it.
export function findHoldAtPoint<T extends { points: Point[] | null }>(
  point: Point,
  holds: T[],
): T | null {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const hold of holds) {
    if (hold.points && pointInPolygon(point, hold.points)) {
      const area = polygonArea(hold.points);
      if (area < bestArea) {
        bestArea = area;
        best = hold;
      }
    }
  }
  return best;
}
