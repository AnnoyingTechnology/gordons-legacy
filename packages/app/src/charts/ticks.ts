/**
 * "Nice" axis ticks: round values (1, 2 or 5 times a power of ten) with about `count` intervals. The
 * first tick is at or below `min` and the last at or above `max`, so the ticks always cover the range.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return [min];
  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep)!;
  // Ticks counted, not stepped by adding: near 1e20 a step of 5,000 is lost in the sum, and near the
  // largest double the last tick overflows; either looped for ever (#32).
  const first = Math.floor(min / step);
  const intervals = Math.ceil(max / step) - first;
  if (!(intervals <= MAXIMUM_INTERVALS) || !Number.isFinite((first + intervals) * step)) return [min, max];
  const ticks: number[] = [];
  for (let index = 0; index <= intervals; index++) {
    const value = (first + index) * step;
    ticks.push(Math.abs(value) < step / 1e6 ? 0 : value);
  }
  return ticks;
}

/** Far more than any axis asks for; a range whose ticks would exceed it is no axis to draw. */
const MAXIMUM_INTERVALS = 1000;
