import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import type { Load, Propellant } from '@gordons-legacy/formats';
import { withPropellant } from '../editor/components.ts';
import { pressureLimits } from './load-assessment.ts';

/**
 * GRT's generic tolerance synthesis (manual p. 53): for each powder, the charges with which the load,
 * otherwise unchanged, passes the user's filters in the simulation. GRT returned one charge per powder;
 * this returns the matches found, each from its lowest to its highest simulated charge.
 *
 * Nothing here assumes that pressure or velocity rise with the charge: the fill window is sampled, every
 * filter is checked at every sample, edges are refined only between a sample that passes and one that
 * doesn't, and the returned ends are rounded inward to the charges shown and simulated again. Charges
 * between two ends were sampled, not all checked.
 *
 * These are simulations with powder models of unknown accuracy, not load data: GRT's manual warns that
 * they "can exceed the specified maximum pressures, or represent no sensible charge or even a dangerous
 * one". The filters are arbitrary, not validated operating bounds. The UI says so beside every result.
 */

export interface SynthesisCriteria {
  /** Peak window, as shares of the lowest maximum (CIP, SAAMI or the load's). */
  pressureShare: { min: number; max: number };
  /** Case-fill window, GRT's Füllgrad. */
  fill: { min: number; max: number };
  /** Muzzle velocity window, m/s; either end may be absent. */
  velocity?: { min?: number; max?: number };
}

/**
 * Defaults, arbitrary filters: a peak from 35 % to 85 % of the maximum (GRT highlights from −15 %), a fill
 * from 60 % to 100 % (no low fill, no compression).
 */
export const DEFAULT_CRITERIA: SynthesisCriteria = { pressureShare: { min: 0.35, max: 0.85 }, fill: { min: 0.6, max: 1 } };

export type CriteriaProblem = 'pressureShare' | 'fill' | 'velocity';

/** Why the criteria can't be searched: not finite, out of range, or a window upside down. */
export function criteriaProblems(criteria: SynthesisCriteria): CriteriaProblem[] {
  const window = (low: number, high: number, from: number, to: number) =>
    Number.isFinite(low) && Number.isFinite(high) && low >= from && high <= to && low <= high;
  const problems: CriteriaProblem[] = [];
  if (!window(criteria.pressureShare.min, criteria.pressureShare.max, 0.01, 1.2)) problems.push('pressureShare');
  if (!window(criteria.fill.min, criteria.fill.max, 0.05, 1.2)) problems.push('fill');
  const velocity = criteria.velocity;
  if (velocity) {
    const finitePositive = (value: number | undefined) => value === undefined || (Number.isFinite(value) && value > 0);
    if (!finitePositive(velocity.min) || !finitePositive(velocity.max) || (velocity.min !== undefined && velocity.max !== undefined && velocity.min > velocity.max)) {
      problems.push('velocity');
    }
  }
  return problems;
}

/** How one charge fares: passes every filter, fails one (the first in this order), or isn't simulated. */
export type ChargeStatus = 'match' | 'refused' | 'pressureHigh' | 'velocityHigh' | 'pressureLow' | 'velocityLow';

export interface SynthesisPoint {
  /** kg, as shown (rounded to the display resolution). */
  charge: number;
  simulation: Simulation;
}

/** A run of matching charges, from its lowest to its highest simulated end. */
export interface SynthesisMatch {
  lowest: SynthesisPoint;
  highest: SynthesisPoint;
}

export interface SynthesisResult {
  /** Usually one; several when charges in between fail or are refused. */
  matches: SynthesisMatch[];
  /** How the sampled charges fared, to say why there's no match. */
  sampled: Record<ChargeStatus, number>;
}

/** Charges sampled across the fill window. */
const SAMPLES = 41;
/** Bisection steps when refining an edge (2⁻²⁰ of a sample interval). */
const REFINEMENT_STEPS = 20;
/** Inward steps tried when the rounded end fails. */
const ROUNDING_TRIES = 5;

/**
 * The matches of one powder for the load. `resolution` is the step of the charges shown, kg (0.001 g, or
 * 0.01 gr in imperial): every returned charge is a multiple of it and was simulated as such.
 */
export function synthesizeCharges(load: Load, propellant: Propellant, criteria: SynthesisCriteria, resolution: number): SynthesisResult {
  const sampled: Record<ChargeStatus, number> = { match: 0, refused: 0, pressureHigh: 0, velocityHigh: 0, pressureLow: 0, velocityLow: 0 };
  const own = simulate(load, load.charge.mass);
  if (!own || criteriaProblems(criteria).length > 0 || !(resolution > 0)) return { matches: [], sampled };
  const base = withPropellant(load, propellant);
  const maximum = pressureLimits(load)[0]!.pressure;

  const statusAt = (charge: number): { status: ChargeStatus; simulation?: Simulation } => {
    const simulation = simulate(base, charge);
    if (!simulation) return { status: 'refused' };
    const { maxPressure: peak, muzzleVelocity: velocity } = simulation;
    if (peak > maximum * criteria.pressureShare.max) return { status: 'pressureHigh', simulation };
    if (criteria.velocity?.max !== undefined && velocity > criteria.velocity.max) return { status: 'velocityHigh', simulation };
    if (peak < maximum * criteria.pressureShare.min) return { status: 'pressureLow', simulation };
    if (criteria.velocity?.min !== undefined && velocity < criteria.velocity.min) return { status: 'velocityLow', simulation };
    return { status: 'match', simulation };
  };
  const passes = (charge: number) => statusAt(charge).status === 'match';

  // GRT's fill is (m / ρ_bulk) / V_b with the same chamber V_b for every powder: scale the load's own.
  const fillPerKilogram = (own.caseFill / load.charge.mass) * (load.propellant.bulkDensity / propellant.bulkDensity);
  const from = criteria.fill.min / fillPerKilogram;
  const to = criteria.fill.max / fillPerKilogram;
  const charges = Array.from({ length: SAMPLES }, (_, index) => from + ((to - from) * index) / (SAMPLES - 1));
  const passing = charges.map((charge) => {
    const { status } = statusAt(charge);
    sampled[status]++;
    return status === 'match';
  });

  const matches: SynthesisMatch[] = [];
  for (let start = 0; start < SAMPLES; start++) {
    if (!passing[start] || (start > 0 && passing[start - 1])) continue;
    let end = start;
    while (end + 1 < SAMPLES && passing[end + 1]) end++;
    // Refine each edge between the last failing sample and the first passing one.
    const low = start > 0 ? refine(passes, charges[start - 1]!, charges[start]!) : charges[start]!;
    const high = end < SAMPLES - 1 ? refine(passes, charges[end + 1]!, charges[end]!) : charges[end]!;
    const match = representable(low, high, resolution, (charge) => {
      const { status, simulation } = statusAt(charge);
      return status === 'match' && charge >= from * (1 - 1e-9) && charge <= to * (1 + 1e-9) ? simulation : undefined;
    });
    if (match) matches.push(match);
  }
  return { matches, sampled };
}

/** Between a charge that fails and one that passes, the passing charge nearest the failing one. */
function refine(passes: (charge: number) => boolean, failing: number, passing: number): number {
  let bad = failing;
  let good = passing;
  for (let step = 0; step < REFINEMENT_STEPS; step++) {
    const middle = (bad + good) / 2;
    if (passes(middle)) good = middle;
    else bad = middle;
  }
  return good;
}

/**
 * The ends rounded inward to the resolution, each simulated again and kept only if it still passes;
 * a few steps further in are tried, else the match isn't representable at this resolution.
 */
function representable(low: number, high: number, resolution: number, check: (charge: number) => Simulation | undefined): SynthesisMatch | undefined {
  const steps = (charge: number) => Math.round(charge / resolution);
  const firstStep = Math.ceil(low / resolution - 1e-9);
  const lastStep = Math.floor(high / resolution + 1e-9);
  let lowest: SynthesisPoint | undefined;
  for (let step = firstStep; step < firstStep + ROUNDING_TRIES && step <= lastStep && !lowest; step++) {
    const simulation = check(step * resolution);
    if (simulation) lowest = { charge: step * resolution, simulation };
  }
  let highest: SynthesisPoint | undefined;
  for (let step = lastStep; step > lastStep - ROUNDING_TRIES && step >= firstStep && !highest; step--) {
    const simulation = check(step * resolution);
    if (simulation) highest = { charge: step * resolution, simulation };
  }
  if (!lowest || !highest || steps(lowest.charge) > steps(highest.charge)) return undefined;
  return { lowest, highest };
}

function simulate(load: Load, charge: number): Simulation | undefined {
  if (!(charge > 0) || !Number.isFinite(charge)) return undefined;
  const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, mass: charge } });
  return result.ok ? result.simulation : undefined;
}
