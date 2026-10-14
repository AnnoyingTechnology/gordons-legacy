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
  /** Simulates the load, or says why it can't: no numbers are returned for inputs outside the model. */
  simulate(load: Load): SimulationResult;
}

export type SimulationResult = { ok: true; simulation: Simulation } | { ok: false; problems: SimulationProblem[] };

/** Why a load can't be simulated. */
export interface SimulationProblem {
  code: SimulationProblemCode;
  /** The input concerned, as a dotted path in the load (`charge.mass`), when there is one. */
  path?: string;
}

export type SimulationProblemCode =
  /** A value is missing, infinite or not a number. */
  | 'not-a-number'
  /** A value must be above zero. */
  | 'not-positive'
  /** A value must not be below zero. */
  | 'negative'
  /** The heat capacity ratio k must be above 1. */
  | 'heat-capacity-ratio-too-low'
  /** The powder's burn coefficients don't define a form function. */
  | 'burn-model-undefined'
  /** The temperature correction makes the vivacity zero or negative. */
  | 'vivacity-not-positive'
  /** The charge's solid volume fills the chamber or more. */
  | 'charge-exceeds-case'
  /** The poured charge is more than 120 % of the chamber: too compressed for the model (GRT's limit). */
  | 'charge-too-compressed'
  /** The seated projectile's base is at or beyond the muzzle. */
  | 'barrel-too-short'
  /** The projectile is seated as deep as the case is long, or deeper. */
  | 'seated-too-deep'
  /** The barrel is too long for the chamber: GRT's expansion ratio ξ_E reaches 300. */
  | 'expansion-too-large'
  /** The initial pressure is too high for the charge to start the projectile in GRT's model. */
  | 'initial-pressure-too-high'
  /** A gas leak has a type the engine doesn't know. */
  | 'unknown-gas-leak'
  /** A gas leak's height doesn't suit its type: a square hole needs one, a slot one up to the bore radius. */
  | 'gas-leak-out-of-range'
  /** The load uses a feature this engine doesn't model (gas leaks, a jump to the lands). */
  | 'not-modelled'
  /** The projectile stops in the barrel: the charge can't push it out. */
  | 'projectile-stops'
  /** The computation produced a value that is not a finite number. */
  | 'numerical-failure';

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
  /** Kinetic energy of the projectile at the muzzle (translation only), J. */
  muzzleEnergy: number;
  /** The poured charge's volume over the chamber's, 0 to 1.2; above 1 the charge is compressed. */
  caseFill: number;
  /** Muzzle energy over the charge's chemical energy, 0 to 1. */
  efficiency: number;
  /** Projectile spin at the muzzle, revolutions per second; absent when the twist is unknown. */
  muzzleSpinRate?: number;
  /**
   * When the pressure first reaches 10 % of its peak, s; absent when the initial pressure is already
   * above that or the first step passes it. GRT counts the barrel time from there for its "bullet lead
   * time".
   */
  tenPercentPeakTime?: number;
  /** Barrel time counted from `tenPercentPeakTime` (GRT's "bullet lead time", BLT), s. */
  leadTime?: number;
  /**
   * The barrel-harmonics node whose optimal barrel time is nearest the lead time (GRT's OBT); absent
   * without a lead time. A model still to be checked against published measurements.
   */
  optimalBarrelTime?: {
    /** Node number; halves are half nodes. */
    node: number;
    /** The node's optimal barrel time, s. */
    time: number;
    /** 1 − lead time / optimal barrel time. */
    deviation: number;
  };
  recoil: Recoil;
  /**
   * Energy left in the powder gas when the projectile leaves the muzzle, J: its internal energy and the
   * kinetic energy of the share of the charge moving with the projectile. What feeds the muzzle blast.
   * Not a GRT output; absent from engines that don't compute it.
   */
  muzzleGasEnergy?: number;
  /** Where the charge finished burning, if it did before the muzzle. */
  burnout?: { travel: number; pressure: number };
  /** Distance from the breech face to the seated projectile's base, m; travel is counted from there. */
  seatedBasePosition: number;
  /** The simulated curve, sampled along the projectile's travel. */
  curve: SimulationCurve;
  /** Reasons the result should not be trusted; empty when none. */
  warnings: SimulationWarning[];
}

/** The gun's recoil from the shot alone (no muzzle device). */
export interface Recoil {
  /** Momentum of the projectile at the muzzle, N·s. */
  projectileImpulse: number;
  /** Momentum of the share of the charge that moves with the projectile, N·s. */
  chargeImpulse: number;
  /** Momentum of the gas leaving the muzzle, N·s. */
  gasImpulse: number;
  /** The sum, N·s. */
  totalImpulse: number;
  /** Velocity of the gas leaving the muzzle, m/s. */
  gasExitVelocity: number;
  /** The gun's motion, when the load gives its mass: free recoil energy (J), velocity (m/s), mean
   * acceleration over the barrel time (m/s²) and the matching force (N). */
  gun?: { energy: number; velocity: number; acceleration: number; force: number };
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
  'pressure-too-low';
