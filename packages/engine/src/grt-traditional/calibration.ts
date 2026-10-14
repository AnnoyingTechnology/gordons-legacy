import type { Load } from '@gordons-legacy/formats';
import type { Simulation } from '../engine.ts';
import { grtTraditional } from './grt-traditional.ts';

/**
 * The searches of GRT's OBT tool (grt-traditional.md, OBT tool): fitting the powder to a measured muzzle
 * velocity, and finding the charge whose lead time matches a barrel-harmonics node. Both step through
 * simulations, coarse to fine, as GRT does; their results are simulations, not load data.
 */

/** Relative steps of k and Ba, coarse to fine. */
const VELOCITY_STEPS = [0.01, 0.005, 0.001, 0.0001, 0.00005];
/** GRT stops changing k and Ba beyond 4.5 % of their original values. */
const MAXIMUM_CHANGE = 0.045;
/** Charge steps, coarse to fine: 1, 0.5, 0.1 and 0.01 grains, in kg. */
const GRAIN = 0.00006479891;
const CHARGE_STEPS = [1, 0.5, 0.1, 0.01].map((grains) => grains * GRAIN);
/** A guard against searches that wouldn't end; GRT's need far fewer. */
const MAXIMUM_SIMULATIONS = 2000;

export interface Calibration {
  /** The load with the adjusted powder or charge. */
  load: Load;
  /** Its simulation. */
  simulation: Simulation;
  /**
   * False when the search stopped at a limit before its target: a load that can't be simulated or has
   * no lead time, GRT's ±4.5 % bound on k and Ba, or the guard on the number of simulations.
   */
  reached: boolean;
}

/**
 * Adjusts the powder's heat capacity ratio k and vivacity Ba together, by the same relative steps,
 * until the simulated muzzle velocity, rounded to 0.1 m/s, matches `muzzleVelocity` (m/s). Undefined
 * when the load can't be simulated.
 */
export function calibrateToVelocity(load: Load, muzzleVelocity: number): Calibration | undefined {
  const k0 = load.propellant.heatCapacityRatio;
  const ba0 = load.propellant.burnModel.vivacity;
  const target = roundTo(muzzleVelocity, 1);
  const withPowder = (k: number, ba: number): Load => ({
    ...load,
    propellant: { ...load.propellant, heatCapacityRatio: k, burnModel: { ...load.propellant.burnModel, vivacity: ba } },
  });
  let state = evaluate(load);
  if (!state) return undefined;
  let k = k0;
  let ba = ba0;
  let simulations = 0;
  let limited = false;
  const velocity = (simulation: Simulation) => roundTo(simulation.muzzleVelocity, 1);
  const withinLimits = () => {
    const within = Math.abs(1 - k0 / k) < MAXIMUM_CHANGE && Math.abs(1 - ba0 / ba) < MAXIMUM_CHANGE && simulations < MAXIMUM_SIMULATIONS;
    if (!within) limited = true;
    return within;
  };
  const step = (direction: 1 | -1, factor: number): boolean => {
    const nextK = k + direction * k0 * factor;
    const nextBa = ba + direction * ba0 * factor;
    const next = evaluate(withPowder(nextK, nextBa));
    simulations++;
    if (!next || next.tenPercentPeakTime === undefined) {
      limited = true;
      return false;
    }
    k = nextK;
    ba = nextBa;
    state = next;
    return true;
  };
  const rising = velocity(state) < target;
  for (const factor of VELOCITY_STEPS) {
    if (rising) {
      while (velocity(state) < target && withinLimits() && step(1, factor));
      if (target < velocity(state)) step(-1, factor);
    } else {
      while (target < velocity(state) && withinLimits() && step(-1, factor));
      if (velocity(state) < target) step(1, factor);
    }
  }
  return { load: withPowder(k, ba), simulation: state, reached: !limited };
}

/**
 * Changes the charge until the lead time crosses `leadTime` (s), coarse to fine; a longer lead time
 * needs less powder. Undefined when the load can't be simulated or has no lead time.
 */
export function chargeForLeadTime(load: Load, leadTime: number): Calibration | undefined {
  let mass = load.charge.mass;
  let state = evaluate(load);
  if (state?.leadTime === undefined) return undefined;
  let simulations = 0;
  const leadTimeAt = (charge: number) => {
    simulations++;
    const simulation = evaluate({ ...load, charge: { ...load.charge, mass: charge } });
    return simulation?.leadTime === undefined ? undefined : simulation;
  };
  // A step to a charge without a lead time (too little powder for the initial pressure, or one that
  // can't be simulated) is not taken; the finer steps carry on from where the search stands.
  const step = (change: number): boolean => {
    const next = leadTimeAt(mass + change);
    if (!next) return false;
    mass += change;
    state = next;
    return true;
  };
  const current = () => state!.leadTime!;
  const tooLong = current() > leadTime;
  const direction = tooLong ? 1 : -1;
  for (const size of CHARGE_STEPS) {
    while ((tooLong ? leadTime < current() : current() < leadTime) && simulations < MAXIMUM_SIMULATIONS && step(direction * size));
    if (tooLong ? current() < leadTime : leadTime < current()) step(-direction * size);
  }
  // Reached when the next finest step would cross the target: the charge is found to 0.01 grain.
  const finest = CHARGE_STEPS[CHARGE_STEPS.length - 1]!;
  const beyond = leadTimeAt(mass + direction * finest);
  const reached = beyond !== undefined && Math.sign(current() - leadTime) !== Math.sign(beyond.leadTime! - leadTime);
  return { load: { ...load, charge: { ...load.charge, mass } }, simulation: state!, reached };
}

function evaluate(load: Load): Simulation | undefined {
  const result = grtTraditional.simulate(load);
  return result.ok ? result.simulation : undefined;
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
