import type { Load } from '@gordons-legacy/formats';

/**
 * An interior-ballistics engine: a load in, a simulated shot out. Engines are pure and synchronous, so
 * they run the same in a browser, a Web Worker, Node or Deno.
 */
export interface Engine {
  /** Stable identifier, for example `grt-traditional`. */
  readonly id: string;
  /** Name shown to users. */
  readonly name: string;
  simulate(load: Load): Simulation;
}

/** The simulated shot. Quantities in SI units. */
export interface Simulation {
  /** Identifier of the engine that produced it. */
  engine: string;
  /** Highest pressure on the curve, Pa. */
  maxPressure: number;
  /** Projectile travel at the highest pressure, m. */
  maxPressureTravel: number;
  /** Velocity at the muzzle, m/s. */
  muzzleVelocity: number;
  /** Pressure when the projectile leaves the muzzle, Pa. */
  muzzlePressure: number;
  /** Time from ignition until the projectile leaves the muzzle, s. */
  barrelTime: number;
  /** Fraction of the charge burnt when the projectile leaves the muzzle, 0 to 1. */
  burntFractionAtMuzzle: number;
  /** Where the charge finished burning, if it did before the muzzle. */
  burnout?: { travel: number; pressure: number };
  /** Distance from the breech face to the seated projectile's base, m; travel is counted from there. */
  seatedBasePosition: number;
  /** The simulated curve, sampled along the projectile's travel. */
  curve: SimulationCurve;
  /** Reasons the result should not be trusted; empty when none. */
  warnings: SimulationWarning[];
}

/** One array per quantity, all of the same length. */
export interface SimulationCurve {
  /** Projectile travel from its seated position, m. */
  travel: Float64Array;
  /** Gas pressure, Pa. */
  pressure: Float64Array;
  /** Projectile velocity, m/s. */
  velocity: Float64Array;
  /** Fraction of the charge burnt, 0 to 1. */
  burntFraction: Float64Array;
  /** Projectile kinetic energy, J. */
  projectileEnergy: Float64Array;
  /** Time since ignition, s. */
  time: Float64Array;
}

export type SimulationWarning =
  /** The peak pressure stays below twice the initial pressure: the load hardly starts. */
  | 'pressure-too-low'
  /** Inputs outside the model's validity (for example a negative Sebert factor). */
  | 'invalid-input'
  /** The load uses a feature the engine doesn't model yet; results ignore it. */
  | 'unsupported-feature';
