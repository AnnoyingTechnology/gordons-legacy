import { exponentialMean, FormFunction, vivacityAtTemperature, VivacitySmoother } from './burn.ts';
import { CONFIG } from './config.ts';
import { chamberVolume } from './geometry.ts';
import type { GrtInputs } from './inputs.ts';
import { Jump } from './jump.ts';
import { GasLeaks } from './leaks.ts';
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
/**
 * Steps after which the solver gives up. Valid inputs need at most about 2001 (Δξ ≥ ξ_E / 2000); this
 * only guards against a loop that wouldn't end.
 */
const MAXIMUM_STEPS = 100_000;
/** Weight of the new acceleration after burnout while gas leaks. */
const LEAKING_ACCELERATION_SMOOTHING = 0.05;

/** A curve point in GRT's units: travel in m, pressure in bar, time in ms. */
export interface GrtPoint {
  travel: number;
  pressure: number;
  velocity: number;
  burntFraction: number;
  projectileEnergy: number;
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
  /** x_eff: the projectile's travel to the muzzle, m. */
  travelToMuzzle: number;
  /** The charge left in the gun at the muzzle (less what leaked), kg. */
  finalChargeMass: number;
  /** V_b at the muzzle (enlarged by a jump to the lands), m³. */
  finalChamberVolume: number;

  /** False when the solver stopped at its step limit before the muzzle. */
  completed: boolean;
}

/**
 * The shot's state that changes during the simulation besides the projectile: the charge mass, which
 * gas leaks reduce, the chamber volume, which the jump to the lands enlarges, and everything GRT
 * derives from them on the fly (grt-traditional.md, Setup).
 */
class Charge {
  mass: number;
  /** V_b: the chamber volume behind the projectile, m³. */
  chamber: number;
  private readonly inputs: GrtInputs;
  readonly frictionMass: number;

  constructor(inputs: GrtInputs) {
    this.inputs = inputs;
    this.mass = inputs.chargeMass;
    this.chamber = chamberVolume(inputs.caseCapacity, inputs.projectileDiameter, inputs.seatingDepth, inputs.base);
    this.frictionMass = inputs.boreArea * inputs.boreResistance * BORE_RESISTANCE_MASS_FACTOR;
  }

  /** V₀: the chamber volume minus the unburnt powder's solid volume, m³. */
  get freeVolume(): number {
    return this.chamber - this.mass / this.inputs.grainDensity;
  }

  /** m: projectile plus the Sebert share of the charge plus the friction mass, kg. GRT also adds air
   * and primer masses, both disabled by its configuration. */
  get effectiveMass(): number {
    return this.frictionMass + this.inputs.sebertFactor * this.mass + this.inputs.projectileMass;
  }
}

/**
 * The projectile's motion and the loss energies (grt-traditional.md, Phase A steps 9 to 11). The
 * cumulative friction and air energies are subtracted from the driving force, as GRT does.
 */
class Motion {
  velocity = 0;
  travel = 0;
  acceleration = 0;
  private friction = 0;
  private air = 0;
  private readonly inputs: GrtInputs;
  private readonly charge: Charge;
  private readonly travelToMuzzle: number;
  private readonly frictionSurface: number;
  private readonly twistRatio: number;

  constructor(inputs: GrtInputs, charge: Charge, travelToMuzzle: number) {
    this.inputs = inputs;
    this.charge = charge;
    this.travelToMuzzle = travelToMuzzle;
    this.frictionSurface = inputs.grooveDiameter * inputs.projectileLength * 0.6 * Math.PI;
    this.twistRatio = inputs.twistLength > 0 ? inputs.grooveDiameter / inputs.twistLength : 0;
  }

  /**
   * Energies lost during the step, J, with `idealVelocity` the closed-form velocity and `leakFraction`
   * δ, the open fraction of the bore: internal friction and air drag only act while gas leaks.
   */
  stepLosses(relativeStep: number, idealVelocity: number, leakFraction: number): { friction: number; air: number; rotation: number } {
    const { boreArea, heatCapacityRatio, projectileMass } = this.inputs;
    const idealSquared = idealVelocity ** 2;
    const air = leakFraction * (relativeStep * boreArea * 1 * idealSquared * heatCapacityRatio);
    const internal =
      leakFraction * (relativeStep * this.travelToMuzzle * this.frictionSurface * CONFIG.internalFriction * 1000000);
    const engraving = relativeStep * idealSquared * this.charge.frictionMass * 0.5;
    const rotation = CONFIG.rotationEnergy
      ? relativeStep * ((this.twistRatio * idealSquared * projectileMass * PI_SQUARED) / 4)
      : 0;
    return { friction: engraving + internal, air, rotation };
  }

  addLosses(losses: { friction: number; air: number }): void {
    this.air = losses.air + this.air;
    this.friction = losses.friction + this.friction;
  }

  /**
   * Advances the projectile to `travel` under the smoothed pressure (bar); after burnout with gas
   * leaking, GRT smooths the acceleration.
   */
  advance(travel: number, smoothedPressure: number, rotation: number, smoothAcceleration: boolean): void {
    const force = this.inputs.boreArea * smoothedPressure * PASCALS_PER_BAR - this.friction - this.air - rotation;
    let acceleration = force / this.charge.effectiveMass;
    if (smoothAcceleration) {
      acceleration =
        this.acceleration * (1 - LEAKING_ACCELERATION_SMOOTHING) + acceleration * LEAKING_ACCELERATION_SMOOTHING;
    }
    this.velocity = Math.sqrt((travel - this.travel) * acceleration * 2 + this.velocity ** 2);
    this.travel = travel;
    this.acceleration = acceleration;
  }
}

/**
 * p_abs, GRT's pressure scale (grt-traditional.md, Phase A step 6; GRT's `fn_pAbs`): 10 · p_abs is in
 * bar. `vivacity` B, `chargeMass` kg, `heatOfExplosion` kJ/kg, `mass` the effective mass kg, `boreArea`
 * m², `freeVolume` V₀ m³.
 */
export function theoreticalPressure(
  vivacity: number,
  chargeMass: number,
  heatOfExplosion: number,
  mass: number,
  k: number,
  boreArea: number,
  freeVolume: number,
): number {
  return ((vivacity * chargeMass * heatOfExplosion) ** 2 * mass * (k - 1) * 2) / (boreArea ** 2 * TECHNICAL_ATMOSPHERE ** 2 * freeVolume);
}

/** The setup's effective mass m, kg (grt-traditional.md, Geometry). */
export function initialEffectiveMass(inputs: GrtInputs): number {
  return new Charge(inputs).effectiveMass;
}

/** The setup's free volume V₀, m³. */
export function initialFreeVolume(inputs: GrtInputs): number {
  return new Charge(inputs).freeVolume;
}

/** Runs GRT's solver (grt-traditional.md, Integration). */
export function solve(inputs: GrtInputs): GrtSolution {
  const { boreArea, heatOfExplosion, heatCapacityRatio: k, initialPressure } = inputs;
  const charge = new Charge(inputs);
  const travelToMuzzle = Math.max(0, inputs.barrelLength - (inputs.caseLength - inputs.seatingDepth));
  // ξ_E changes while the projectile crosses the jump, which enlarges the chamber.
  let expansionAtMuzzle = travelToMuzzle * (boreArea / charge.freeVolume);
  const step = Math.max(MINIMUM_STEP, expansionAtMuzzle * STEP_FRACTION);
  const ba0 = vivacityAtTemperature(inputs);
  const formFunction = new FormFunction(inputs);
  const vivacity = new VivacitySmoother(ba0, inputs);
  const leaks = new GasLeaks(inputs);
  const jump = new Jump(inputs, charge.chamber);
  const motion = new Motion(inputs, charge, travelToMuzzle);
  const time = new TimeIntegrator();
  const points: GrtPoint[] = [];
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
  while (!(expansionAtMuzzle < expansion || burntFraction > 1) && points.length < MAXIMUM_STEPS) {
    const relativeStep = (expansion - previousExpansion) / expansionAtMuzzle;
    const timeStep = time.lastIncrement / 1000;
    const clamped = Math.min(expansion, expansionAtMuzzle);
    const travel = (travelToMuzzle / expansionAtMuzzle) * clamped;
    theta = 1 - 1 / (clamped + 1) ** ((k - 1) / 2);
    const b = vivacity.next(formFunction.at(burntFraction) * ba0);
    const chargeMass = charge.mass;
    const mass = charge.effectiveMass;
    const idealVelocity = theta * ((heatOfExplosion * chargeMass * b * 2 * 1000) / (boreArea * TECHNICAL_ATMOSPHERE));
    burntFraction = idealVelocity * ((mass * b) / (boreArea * TECHNICAL_ATMOSPHERE));
    const absolutePressure = theoreticalPressure(b, chargeMass, heatOfExplosion, mass, k, boreArea, charge.freeVolume);
    const meanPressure = ((theta - theta ** 2) / (clamped + 1)) * absolutePressure * 10;
    const pressure = (1 - burntFraction) * initialPressure + meanPressure;
    const loss = leaks.pressureLoss(relativeStep, timeStep, pressure, travel, burntFraction, charge);
    smoothedPressure = exponentialMean(smoothedPressure, pressure - loss, CONFIG.pressureSmoothingBurning);
    const losses = motion.stepLosses(relativeStep, idealVelocity, leaks.openFraction);
    motion.addLosses(losses);
    motion.advance(travel, smoothedPressure, losses.rotation, false);
    record(burntFraction, smoothedPressure);
    const chamber = jump.chamberAt(time.last);
    if (chamber !== undefined) {
      charge.chamber = chamber;
      expansionAtMuzzle = travelToMuzzle * (boreArea / charge.freeVolume);
    }
    previousExpansion = clamped;
    expansion += step;
  }
  const burnoutIndex = points.length;
  const finalBurntFraction = Math.min(1, burntFraction);

  // Phase B: adiabatic expansion after burnout. GRT keeps the last burnt fraction (possibly a little
  // above 1) for the gas lost through leaks.
  const thetaAtBurnout = theta;
  while (!(expansionAtMuzzle < expansion) && points.length < MAXIMUM_STEPS) {
    const relativeStep = (expansion - previousExpansion) / expansionAtMuzzle;
    const timeStep = time.lastIncrement / 1000;
    const clamped = Math.min(expansion, expansionAtMuzzle);
    const travel = (travelToMuzzle / expansionAtMuzzle) * clamped;
    const sigma = 1 - 1 / ((clamped + 1) ** (k - 1) * (1 - thetaAtBurnout));
    const idealVelocity = Math.sqrt(((sigma * heatOfExplosion * charge.mass * 2) / charge.effectiveMass) * 1000);
    const chemicalEnergy = heatOfExplosion * charge.mass * 1000;
    const kineticEnergy = idealVelocity ** 2 * charge.effectiveMass * 0.5;
    // GRT computes the step's losses with the leak fraction of the previous step here.
    const losses = motion.stepLosses(relativeStep, idealVelocity, leaks.openFraction);
    const gasVolume = (boreArea * travel + charge.freeVolume) / (k - 1);
    const pressure = (chemicalEnergy - kineticEnergy) / (gasVolume * PASCALS_PER_BAR);
    const loss = leaks.pressureLoss(relativeStep, timeStep, pressure, travel, burntFraction, charge);
    smoothedPressure = exponentialMean(smoothedPressure, pressure - loss, CONFIG.pressureSmoothingAfterBurnout);
    motion.addLosses(losses);
    motion.advance(travel, smoothedPressure, losses.rotation, leaks.openFraction > 0);
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
    travelToMuzzle,
    finalChargeMass: charge.mass,
    finalChamberVolume: charge.chamber,
    completed: points.length < MAXIMUM_STEPS,
  };
}
