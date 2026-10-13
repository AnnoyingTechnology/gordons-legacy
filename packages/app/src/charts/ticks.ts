/**
 * "Nice" axis ticks: round values (1, 2 or 5 times a power of ten) covering [min, max] with about
 * `count` intervals.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep)!;
  const ticks: number[] = [];
  for (let value = Math.floor(min / step) * step; value <= max + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1e6 ? 0 : value);
  }
  return ticks;
}
