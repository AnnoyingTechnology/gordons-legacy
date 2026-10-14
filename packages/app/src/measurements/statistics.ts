/** Summary of a string of shots, as reloaders read a chronograph: mean, spread and deviation. */
export interface ShotStatistics {
  count: number;
  mean: number;
  /** Sample standard deviation (n − 1); undefined for a single shot. */
  standardDeviation?: number;
  /** Highest minus lowest. */
  extremeSpread: number;
}

/** Statistics of some values; undefined when there are none. */
export function shotStatistics(values: readonly number[]): ShotStatistics | undefined {
  if (values.length === 0) return undefined;
  const count = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const extremeSpread = Math.max(...values) - Math.min(...values);
  if (count < 2) return { count, mean, extremeSpread };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  return { count, mean, standardDeviation: Math.sqrt(variance), extremeSpread };
}
