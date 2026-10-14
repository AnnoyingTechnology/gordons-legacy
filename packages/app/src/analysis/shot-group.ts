/**
 * Statistics of a group of hits on a target, as GRT's shot-group analysis gives them. Positions in
 * metres in the target's plane (x to the right, y down, as on an image); sizes are centre to centre.
 */

export interface Hit {
  x: number;
  y: number;
}

export interface GroupStatistics {
  count: number;
  /** The group's centre (mean point of impact). */
  centre: Hit;
  /** Largest distance between two hits (extreme spread), m. */
  extremeSpread: number;
  /** Smallest distance between two hits, m. */
  minimumSpacing: number;
  /** Mean distance of the hits from the centre, m. */
  meanRadius: number;
  /** Sample standard deviations across and along (n − 1), m, and their radial combination. */
  horizontalDeviation: number;
  verticalDeviation: number;
  radialDeviation: number;
}

/** Statistics of at least two hits; undefined for fewer. */
export function groupStatistics(hits: readonly Hit[]): GroupStatistics | undefined {
  const count = hits.length;
  if (count < 2) return undefined;
  const centre = { x: hits.reduce((sum, hit) => sum + hit.x, 0) / count, y: hits.reduce((sum, hit) => sum + hit.y, 0) / count };
  let extremeSpread = 0;
  let minimumSpacing = Infinity;
  for (let first = 0; first < count; first++) {
    for (let second = first + 1; second < count; second++) {
      const distance = Math.hypot(hits[first]!.x - hits[second]!.x, hits[first]!.y - hits[second]!.y);
      extremeSpread = Math.max(extremeSpread, distance);
      minimumSpacing = Math.min(minimumSpacing, distance);
    }
  }
  const meanRadius = hits.reduce((sum, hit) => sum + Math.hypot(hit.x - centre.x, hit.y - centre.y), 0) / count;
  const deviation = (key: 'x' | 'y') => Math.sqrt(hits.reduce((sum, hit) => sum + (hit[key] - centre[key]) ** 2, 0) / (count - 1));
  const horizontalDeviation = deviation('x');
  const verticalDeviation = deviation('y');
  return {
    count,
    centre,
    extremeSpread,
    minimumSpacing,
    meanRadius,
    horizontalDeviation,
    verticalDeviation,
    radialDeviation: Math.hypot(horizontalDeviation, verticalDeviation),
  };
}

/** An angle subtended at `distance` (m) by `size` (m), in minutes of angle. */
export function minutesOfAngle(size: number, distance: number): number {
  return ((Math.atan2(size, distance) * 180) / Math.PI) * 60;
}

/** The same angle in milliradians. */
export function milliradians(size: number, distance: number): number {
  return Math.atan2(size, distance) * 1000;
}
