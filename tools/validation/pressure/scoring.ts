/**
 * The statistics of the pressure study, as issue #31's protocol fixes them before any data is seen:
 *
 * - per condition, the log ratio r = ln(predicted / measured), shown to people as exp(r) − 1;
 * - the asymmetric loss L(r) = 5·max(−r, 0) + max(r, 0), under-prediction costing five times as much
 *   (a policy choice, also shown at 2 and 10);
 * - a charge series counts once: its conditions' log ratios are averaged before anything is pooled;
 * - only conditions both engines simulate are compared (paired eligibility), and refusals stay listed;
 * - intervals resample whole series.
 *
 * Mean absolute percentage error is deliberately absent: with the measurement in the denominator it
 * rewards under-prediction, the dangerous direction.
 */

/** ln(predicted / measured). */
export function logRatio(predicted: number, measured: number): number {
  return Math.log(predicted / measured);
}

/** L(r) = factor·max(−r, 0) + max(r, 0). */
export function asymmetricLoss(r: number, factor = 5): number {
  return r < 0 ? -factor * r : r;
}

/** One condition's log ratio, with the series it belongs to. */
export interface SeriesValue {
  series: string;
  value: number;
}

/** The mean of each series' values, one entry per series, in the order series first appear. */
export function seriesMeans(values: SeriesValue[]): SeriesValue[] {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const { series, value } of values) {
    const entry = sums.get(series) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    sums.set(series, entry);
  }
  return [...sums].map(([series, { sum, count }]) => ({ series, value: sum / count }));
}

/** Summary of log ratios over series. */
export interface LogRatioSummary {
  conditions: number;
  series: number;
  /** 100·(exp(mean r) − 1), %: the geometric mean bias. */
  geometricMeanBias: number;
  /** Mean |r|: per condition, averaged within each series, then over series. The symmetric figure. */
  meanAbsoluteLogError: number;
  /** Standard deviation of the series' r (0 for one series). */
  spread: number;
  /** Smallest, median and largest series r, as exp(r) − 1, %. */
  lowest: number;
  median: number;
  highest: number;
  /**
   * Mean asymmetric loss at the factors 2, 5 (primary) and 10: per condition first, then averaged within
   * each series and over series, so that a series' over- and under-predictions don't cancel.
   */
  loss: { factor2: number; factor5: number; factor10: number };
  /** Share of series whose mean log ratio is negative, 0 to 1. */
  underPredicted: number;
}

export function summarize(values: SeriesValue[]): LogRatioSummary | undefined {
  const series = seriesMeans(values).map(({ value }) => value);
  if (series.length === 0) return undefined;
  // A loss is taken per condition, then averaged: averaging the log ratios first would let opposite errors cancel.
  const meanOf = (loss: (r: number) => number) => average(seriesMeans(values.map(({ series, value }) => ({ series, value: loss(value) }))).map(({ value }) => value));
  const mean = average(series);
  const sorted = [...series].sort((a, b) => a - b);
  const percent = (r: number) => 100 * (Math.exp(r) - 1);
  const spread = series.length > 1 ? Math.sqrt(series.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (series.length - 1)) : 0;
  return {
    conditions: values.length,
    series: series.length,
    geometricMeanBias: percent(mean),
    meanAbsoluteLogError: meanOf(Math.abs),
    spread,
    lowest: percent(sorted[0]!),
    median: percent(median(sorted)),
    highest: percent(sorted[sorted.length - 1]!),
    loss: {
      factor2: meanOf((r) => asymmetricLoss(r, 2)),
      factor5: meanOf((r) => asymmetricLoss(r, 5)),
      factor10: meanOf((r) => asymmetricLoss(r, 10)),
    },
    underPredicted: series.filter((r) => r < 0).length / series.length,
  };
}

/** Two engines' log ratios on the same condition. */
export interface PairedValue {
  series: string;
  first: number;
  second: number;
}

/**
 * The paired difference in asymmetric loss, D = L(r_second) − L(r_first), averaged per series and then
 * over series, with a 95 % interval from resampling whole series. Negative favours the second engine.
 * With a handful of series the interval is exploratory: it reflects the scatter between those series
 * only, not the uncertainty shared by all of them (one laboratory, one powder model, assumed inputs).
 */
export function pairedLossDifference(values: PairedValue[], factor = 5, resamples = 10000): { mean: number; low: number; high: number; series: number } | undefined {
  const differences = seriesMeans(values.map(({ series, first, second }) => ({ series, value: asymmetricLoss(second, factor) - asymmetricLoss(first, factor) }))).map(
    ({ value }) => value,
  );
  if (differences.length === 0) return undefined;
  const random = seededRandom(31);
  const means: number[] = [];
  for (let k = 0; k < resamples; k++) {
    let sum = 0;
    for (let i = 0; i < differences.length; i++) sum += differences[Math.floor(random() * differences.length)]!;
    means.push(sum / differences.length);
  }
  means.sort((a, b) => a - b);
  return {
    mean: average(differences),
    low: means[Math.floor(0.025 * resamples)]!,
    high: means[Math.ceil(0.975 * resamples) - 1]!,
    series: differences.length,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Mulberry32: a small deterministic generator, so that a report's intervals are reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
