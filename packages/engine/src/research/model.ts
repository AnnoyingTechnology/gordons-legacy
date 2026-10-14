import { CONFIG } from '../grt-traditional/config.ts';
import { FormFunction, vivacityAtTemperature } from '../grt-traditional/burn.ts';
import { chamberVolume } from '../grt-traditional/geometry.ts';
import type { GrtInputs } from '../grt-traditional/inputs.ts';

/**
 * The research engine's equations (docs/model/research-engine.md, State and equations), in SI. The
 * state vector is [z, x, v, W_r]: burnt fraction, projectile travel (m), velocity (m/s) and the work
 * done against the bore resistance (J).
 */

/** One technical atmosphere, Pa: the reference of GRT's vivacity. */
const TECHNICAL_ATMOSPHERE = 98066.5;
const PASCALS_PER_BAR = 1e5;
const JOULES_PER_KILOJOULE = 1e3;

/** Provisional resistance parameters, to be set from published friction data (design, item 6). */
export const RESISTANCE = {
  /** Share of the projectile's length that engraves, before the resistance drops to friction. */
  engravingShare: 0.5,
  /** Friction pressure after engraving, as a share of the initial pressure. */
  frictionShare: 0.2,
} as const;

export interface Pressures {
  /** Space-mean pressure p̄, Pa. */
  mean: number;
  /** Pressure on the projectile's base, Pa. */
  base: number;
  /** Breech pressure, the chamber-pressure estimate, Pa. */
  breech: number;
  /** Resistance pressure at this travel, Pa. */
  resistance: number;
}

export class ResearchModel {
  readonly inputs: GrtInputs;
  /** Covolume η, m³/kg. */
  readonly covolume: number;
  /** M: the projectile's mass plus its rotational inertia, kg. */
  readonly effectiveMass: number;
  /** V_b: the chamber behind the seated projectile, m³ (as GRT computes it). */
  readonly chamber: number;
  /** Q in J/kg. */
  readonly heatOfExplosion: number;
  /** Ba at the powder's temperature, s⁻¹ per technical atmosphere. */
  readonly vivacity: number;
  /** x_eff: travel to the muzzle, m. */
  readonly travelToMuzzle: number;
  /** E_ign, J. */
  readonly ignitionEnergy: number;
  private readonly formFunction: FormFunction;
  private readonly engravingTravel: number;

  constructor(inputs: GrtInputs, covolume: number) {
    this.inputs = inputs;
    this.covolume = covolume;
    const radius = inputs.projectileDiameter / 2;
    const spin = inputs.twistLength > 0 ? (2 * Math.PI) / inputs.twistLength : 0;
    // A solid cylinder's moment of inertia, m r² / 2 (design, item 2).
    this.effectiveMass = inputs.projectileMass + ((inputs.projectileMass * radius * radius) / 2) * spin * spin;
    this.chamber = chamberVolume(inputs.caseCapacity, inputs.projectileDiameter, inputs.seatingDepth, inputs.base);
    this.heatOfExplosion = inputs.heatOfExplosion * JOULES_PER_KILOJOULE;
    this.vivacity = vivacityAtTemperature(inputs);
    this.travelToMuzzle = inputs.barrelLength - (inputs.caseLength - inputs.seatingDepth);
    this.ignitionEnergy = CONFIG.primerEnergy;
    this.formFunction = new FormFunction(inputs);
    this.engravingTravel = inputs.projectileLength * RESISTANCE.engravingShare;
  }

  /** Free gas volume with Noble-Abel covolume, m³ (design, item 4). */
  freeVolume(z: number, x: number): number {
    const { chargeMass, grainDensity, boreArea } = this.inputs;
    return this.chamber + boreArea * x - (chargeMass * (1 - z)) / grainDensity - this.covolume * z * chargeMass;
  }

  /** Resistance pressure p_f at a travel, Pa (design, item 6). */
  resistance(x: number): number {
    const initial = this.inputs.initialPressure * PASCALS_PER_BAR;
    return x < this.engravingTravel ? initial : initial * RESISTANCE.frictionShare;
  }

  /** The pressures for a state; `moving` false before shot start, when there is no gradient. */
  pressures(z: number, x: number, v: number, resistanceWork: number, moving: boolean): Pressures {
    const { chargeMass, heatCapacityRatio: k } = this.inputs;
    const energy =
      z * chargeMass * this.heatOfExplosion + this.ignitionEnergy - 0.5 * (this.effectiveMass + chargeMass / 3) * v * v - resistanceWork;
    const mean = ((k - 1) * energy) / this.freeVolume(z, x);
    if (!moving) return { mean, base: mean, breech: mean, resistance: this.resistance(0) };
    const resistance = this.resistance(x);
    const ratio = chargeMass / (3 * this.effectiveMass);
    const base = (mean + ratio * resistance) / (1 + ratio);
    const breech = base + (chargeMass / (2 * this.effectiveMass)) * (base - resistance);
    return { mean, base, breech, resistance };
  }

  /** dz/dt at the mean pressure (design, item 1). */
  burnRate(z: number, meanPressure: number): number {
    if (z >= 1 || !(meanPressure > 0)) return 0;
    const b = this.vivacity * this.formFunction.at(z);
    const { shotshell, initialPressure } = this.inputs;
    // GRT's initial-pressure factor, with p_s in bar as GRT writes it.
    const factor = shotshell ? 1 : b * CONFIG.vivacityInitialPressureFactor * initialPressure + 1;
    return b * factor * (meanPressure / TECHNICAL_ATMOSPHERE);
  }

  /** The state's derivative, for the integrator; `moving` selects the phase. */
  derivative(moving: boolean): (t: number, y: Float64Array, dy: Float64Array) => void {
    const { boreArea } = this.inputs;
    return (_t, y, dy) => {
      const z = y[0]!;
      const x = y[1]!;
      const v = y[2]!;
      const pressures = this.pressures(z, x, v, y[3]!, moving);
      dy[0] = this.burnRate(z, pressures.mean);
      if (!moving) {
        dy[1] = 0;
        dy[2] = 0;
        dy[3] = 0;
        return;
      }
      // The projectile never moves backwards: once moving, it at most stops accelerating.
      const acceleration = (boreArea * (pressures.base - pressures.resistance)) / this.effectiveMass;
      dy[1] = v;
      dy[2] = v <= 0 && acceleration < 0 ? 0 : acceleration;
      dy[3] = boreArea * pressures.resistance * Math.max(0, v);
    };
  }
}
