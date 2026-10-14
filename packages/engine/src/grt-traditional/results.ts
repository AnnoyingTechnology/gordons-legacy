import type { GrtPoint } from './solver.ts';

/**
 * GRT's derived results (grt-traditional.md, Results), from the solved curve. Units are GRT's where
 * the arithmetic must match it: pressure in bar, time in ms.
 */

/**
 * Time at which the pressure first reaches 10 % of its peak, ms, as GRT finds it: the curve up to the
 * first point above that pressure, as (10·t, p) points, is resampled along a Catmull-Rom spline, and
 * the result is the last sample at or below 10 % of the peak. Undefined when the initial pressure is
 * already above it, or when the time found is 0 (the pressure jumps past 10 % in the first step); GRT
 * then shows no lead time.
 */
export function tenPercentPeakTime(
  points: readonly GrtPoint[],
  peakPressure: number,
  initialPressure: number,
): number | undefined {
  const threshold = peakPressure * 0.1;
  if (!(initialPressure < threshold)) return undefined;
  const rising: Array<[number, number]> = [];
  for (const point of points) {
    rising.push([point.time * 10, point.pressure]);
    if (threshold < point.pressure) break;
  }
  const samples = catmullRomSamples(rising);
  let time = 0;
  for (let index = samples.length - 1; index >= 0; index--) {
    const [x, pressure] = samples[index]!;
    time = x / 10;
    if (!(threshold < pressure)) break;
  }
  return time > 0 ? time : undefined;
}

/**
 * GRT's spline resampling of a polyline: each segment from point i to i + 1 is sampled at t = k / D,
 * k = 0 … ⌊D − 1⌋, with D = max(2, |x_{i−1} − x_{i+2}| + |y_{i−1} − y_{i+1}|) (GRT pairs x with the
 * point after next and y with the next point). Ends repeat the first and last points.
 */
function catmullRomSamples(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const last = points.length - 1;
  const samples: Array<[number, number]> = [];
  for (let index = 0; index < last; index++) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = index > last - 2 ? points[last]! : points[index + 1]!;
    const p3 = index > last - 2 ? points[last]! : points[index + 2]!;
    const divisions = Math.max(2, Math.abs(p0[0] - p3[0]) + Math.abs(p0[1] - p2[1]));
    const count = Math.trunc(divisions - 1);
    for (let step = 0; step <= count; step++) {
      const t = step / divisions;
      samples.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  return samples;
}

/** The Catmull-Rom spline between p1 and p2 at t, written in GRT's order of operations. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p1 +
    t * (p2 / 2 + -p0 / 2) +
    t * t * (p2 * 2 + (p0 - (p1 * 5) / 2) - p3 / 2) +
    t * t * t * (p3 / 2 + ((p1 * 3) / 2 + -p0 / 2 - (p2 * 3) / 2))
  );
}
