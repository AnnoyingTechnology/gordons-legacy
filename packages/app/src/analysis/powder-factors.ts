import type { Propellant } from '@gordons-legacy/formats';

/**
 * GRT's sorting factors for its relative burning-rate table and its powder search (GRT manual, 2021-09-29,
 * p. 46): brisance Br = √(2 (k − 1)) · Ba · Qex / 10⁴, progressivity Bp = Br · φ(z1), and their quadratic
 * mean Brp, which GRT recommends for similarity searches. Qex in kJ/kg, Ba in GRT's units, φ the
 * progressive branch of GRT's form function, (1 + a0 z)^0.3571. They rank powders roughly; a powder at
 * the same level is not a substitute. A powder whose k is 1 or less, which no engine simulates, has
 * no brisance: its factors are NaN.
 */
export interface PowderFactors {
  brisance: number;
  progressivity: number;
  combined: number;
}

/** Exponent of the progressive branch of GRT's form function (grt-traditional.md). */
const PROGRESSIVE_EXPONENT = 0.3571;

export function powderFactors(propellant: Propellant): PowderFactors {
  const { vivacity, a0, z1 } = propellant.burnModel;
  const brisance = (Math.sqrt(2 * (propellant.heatCapacityRatio - 1)) * vivacity * (propellant.heatOfExplosion / 1000)) / 10000;
  const progressivity = brisance * (1 + a0 * z1) ** PROGRESSIVE_EXPONENT;
  return { brisance, progressivity, combined: Math.sqrt((brisance ** 2 + progressivity ** 2) / 2) };
}

/**
 * Orders powders by their combined factor, those without one last: a comparison with NaN would leave
 * the order of the whole table undefined (#32).
 */
export function byCombinedFactor(a: PowderFactors, b: PowderFactors): number {
  const rank = (factors: PowderFactors) => (Number.isFinite(factors.combined) ? factors.combined : Number.POSITIVE_INFINITY);
  const [first, second] = [rank(a), rank(b)];
  return first === second ? 0 : first - second;
}
