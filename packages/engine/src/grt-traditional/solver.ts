import { exponentialMean, FormFunction, vivacityAtTemperature, VivacitySmoother } from './burn.ts';
import { CONFIG } from './config.ts';
import { chamberVolume } from './geometry.ts';
import type { GrtInputs } from './inputs.ts';
import { TimeIntegrator } from './time.ts';

/** One technical atmosphere, Pa: the reference pressure of GRT's burn law. */
const TECHNICAL_ATMOSPHERE = 98066.5;
/** Converts a pressure in bar to a force per unit area in Pa. */
const PASCALS_PER_BAR = 100000;
/** GRT's conversion of a bore resistance in bar to an added mass (1 / 9.80665 kgf). */
const BORE_RESISTANCE_MASS_FACTOR = 0.10197162129779;
/** π², as GRT writes it in the rotation energy. */
const PI_SQUARED = 9.869604401089358;
/** Steps over the barrel: Δξ = ξ_E / 2000, but never below 0.001. */
const STEP_FRACTION = 0.005 / 10;
const MINIMUM_STEP = 0.001;

/** A curve point in GRT's units: travel in m, pressure in bar. */
export interface GrtPoint {
  travel: number;
  pressure: number;
  velocity: number;
  burntFraction: number;
  projectileEnergy: number;
  /** Time since ignition, ms. */
  time: number;
}

export interface GrtSolution {
  points: GrtPoint[];
  /** Index of the last point before burnout; the curve's length when the powder doesn't burn out. */
  burnoutIndex: number;
  /** Burnt fraction when the powder stops burning or the projectile leaves the muzzle. */
  finalBurntFraction: number;
  /** Distance from the breech face to the seated projectile's base, m. */
  seatedBasePosition: number;
  /** False when the powder's z2 needs GRT's recomputation, which isn't reproduced yet. */
  supported: boolean;
}

/** Quantities fixed for the whole shot (grt-traditional.md, Setup). */
interface ShotConstants {
  ba0: number;
  freeVolume: number;
  travelToMuzzle: number;
  expansionAtMuzzle: number;
  effectiveMass: number;
  frictionMass: number;
  twistRatio: number;
}

function shotConstants(inputs: GrtInputs): ShotConstants {
  const chamber = chamberVolume(inputs.caseCapacity, inputs.projectileDiameter, inputs.seatingDepth, inputs.base);
  const freeVolume = chamber - inputs.chargeMass / inputs.grainDensity;
  const travelToMuzzle = Math.max(0, inputs.barrelLength - (inputs.caseLength - inputs.seatingDepth));
  const frictionMass = inputs.boreArea * inputs.boreResistance * BORE_RESISTANCE_MASS_FACTOR;
  return {
    ba0: vivacityAtTemperature(inputs),
    freeVolume,
    travelToMuzzle,
    expansionAtMuzzle: travelToMuzzle * (inputs.boreArea / freeVolume),
    // GRT also adds air and primer masses, both disabled by its configuration.
    effectiveMass: frictionMass + inputs.sebertFactor * inputs.chargeMass + inputs.projectileMass,
    frictionMass,
    twistRatio: inputs.twistLength > 0 ? inputs.grooveDiameter / inputs.twistLength : 0,
  };
}

/**
 * The motion of the projectile and the loss energies, shared by both phases
 * (grt-traditional.md, Phase A steps 9 to 11).
 */
class Motion {
  velocity = 0;
  travel = 0;
  private friction = 0;
  private air = 0;
  private readonly inputs: GrtInputs;
  private readonly constants: ShotConstants;

  constructor(inputs: GrtInputs, constants: ShotConstants) {
    this.inputs = inputs;
    this.constants = constants;
  }

  /**
   * Advances the projectile to `travel` under the smoothed pressure (bar), with `idealVelocity` the
   * closed-form velocity used by the loss terms and `relativeStep` the step Δ.
   */
  advance(travel: number, smoothedPressure: number, idealVelocity: number, relativeStep: number): void {
    const { effectiveMass, frictionMass, twistRatio } = this.constants;
    const idealSquared = idealVelocity ** 2;
    // Engraving friction; internal friction and air drag only act with gas leaks (GRT multiplies them
    // by the leak factor), which this engine doesn't model yet.
    const engravingFriction = relativeStep * idealSquared * frictionMass * 0.5;
    const rotation = CONFIG.rotationEnergy
      ? relativeStep * ((twistRatio * idealSquared * this.inputs.projectileMass * PI_SQUARED) / 4)
      : 0;
    this.friction = engravingFriction + this.friction;
    const force = this.inputs.boreArea * smoothedPressure * PASCALS_PER_BAR - this.friction - this.air - rotation;
    const acceleration = force / effectiveMass;
    this.velocity = Math.sqrt((travel - this.travel) * acceleration * 2 + this.velocity ** 2);
    this.travel = travel;
  }
}

/** Runs GRT's solver (grt-traditional.md, Integration). */
export function solve(inputs: GrtInputs): GrtSolution {
  const constants = shotConstants(inputs);
  const { ba0, freeVolume, travelToMuzzle, expansionAtMuzzle, effectiveMass } = constants;
  const { boreArea, chargeMass, heatOfExplosion, heatCapacityRatio: k, initialPressure } = inputs;
  const step = Math.max(MINIMUM_STEP, expansionAtMuzzle * STEP_FRACTION);
  const formFunction = new FormFunction(inputs);
  const vivacity = new VivacitySmoother(ba0, inputs);
  const motion = new Motion(inputs, constants);
  const points: GrtPoint[] = [];
  const time = new TimeIntegrator();
  const record = (burntFraction: number, pressure: number) => {
    time.add(motion.travel, points.at(-1)?.velocity ?? 0);
    points.push({
      travel: motion.travel,
      pressure,
      velocity: motion.velocity,
      burntFraction,
      projectileEnergy: motion.velocity ** 2 * (inputs.projectileMass / 2),
      time: 0,
    });
  };

  let expansion = 0;
  let previousExpansion = 0;
  let burntFraction = 0;
  let smoothedPressure = 0;
  let theta = 0;

  // Phase A: while the powder burns.
  while (!(expansionAtMuzzle < expansion || burntFraction > 1)) {
    const relativeStep = (expansion - previousExpansion) / expansionAtMuzzle;
    const clamped = Math.min(expansion, expansionAtMuzzle);
    const travel = (travelToMuzzle / expansionAtMuzzle) * clamped;
    theta = 1 - 1 / (clamped + 1) ** ((k - 1) / 2);
    const b = vivacity.next(formFunction.at(burntFraction) * ba0);
    const idealVelocity = theta * ((heatOfExplosion * chargeMass * b * 2 * 1000) / (boreArea * TECHNICAL_ATMOSPHERE));
    burntFraction = idealVelocity * ((effectiveMass * b) / (boreArea * TECHNICAL_ATMOSPHERE));
    const absolutePressure =
      ((b * chargeMass * heatOfExplosion) ** 2 * effectiveMass * (k - 1) * 2) /
      (boreArea ** 2 * TECHNICAL_ATMOSPHERE ** 2 * freeVolume);
    const meanPressure = ((theta - theta ** 2) / (clamped + 1)) * absolutePressure * 10;
    const pressure = (1 - burntFraction) * initialPressure + meanPressure;
    smoothedPressure = exponentialMean(smoothedPressure, pressure, CONFIG.pressureSmoothingBurning);
    motion.advance(travel, smoothedPressure, idealVelocity, relativeStep);
    record(burntFraction, smoothedPressure);
    previousExpansion = clamped;
    expansion += step;
  }
  const burnoutIndex = points.length;
  const finalBurntFraction = Math.min(1, burntFraction);

  // Phase B: adiabatic expansion after burnout.
  const thetaAtBurnout = theta;
  const chemicalEnergy = heatOfExplosion * chargeMass * 1000;
  while (!(expansionAtMuzzle < expansion)) {
    const relativeStep = (expansion - previousExpansion) / expansionAtMuzzle;
    const clamped = Math.min(expansion, expansionAtMuzzle);
    const travel = (travelToMuzzle / expansionAtMuzzle) * clamped;
    const sigma = 1 - 1 / ((clamped + 1) ** (k - 1) * (1 - thetaAtBurnout));
    const idealVelocity = Math.sqrt(((sigma * heatOfExplosion * chargeMass * 2) / effectiveMass) * 1000);
    const kineticEnergy = idealVelocity ** 2 * effectiveMass * 0.5;
    const gasVolume = (boreArea * travel + freeVolume) / (k - 1);
    const pressure = (chemicalEnergy - kineticEnergy) / (gasVolume * PASCALS_PER_BAR);
    smoothedPressure = exponentialMean(smoothedPressure, pressure, CONFIG.pressureSmoothingAfterBurnout);
    motion.advance(travel, smoothedPressure, idealVelocity, relativeStep);
    record(1, smoothedPressure);
    previousExpansion = clamped;
    expansion += step;
  }

  // Times are final only now: each pair step revises the point before it.
  points.forEach((point, index) => (point.time = time.times[index]!));

  return {
    points,
    burnoutIndex,
    finalBurntFraction,
    seatedBasePosition: inputs.caseLength - inputs.seatingDepth,
    supported: formFunction.hasUsableZ2,
  };
}
