import { CONFIG } from './config.ts';
import type { GrtInputs } from './inputs.ts';

/** GRT's reference powder temperature, °C. */
const REFERENCE_TEMPERATURE = 21;
/** Temperature spans of the coefficients' definition, K: from −20 °C and to +60 °C. */
const COLD_SPAN = 41;
const HOT_SPAN = 39;
/** Coefficients GRT uses when a powder has none (both 0). */
const DEFAULT_COLD_COEFFICIENT = -0.0214;
const DEFAULT_HOT_COEFFICIENT = 0.0381;

/** Vivacity Ba₀ at the powder's temperature (grt-traditional.md, Vivacity at the powder temperature). */
export function vivacityAtTemperature(inputs: GrtInputs): number {
  let cold = inputs.coldTemperatureCoefficient;
  let hot = inputs.hotTemperatureCoefficient;
  if (cold === 0 && hot === 0) {
    cold = DEFAULT_COLD_COEFFICIENT;
    hot = DEFAULT_HOT_COEFFICIENT;
  }
  const deltaT = inputs.temperature - REFERENCE_TEMPERATURE;
  if (deltaT > 0) return hot * deltaT * (inputs.vivacity / HOT_SPAN) + inputs.vivacity;
  if (deltaT < 0) return cold * deltaT * (inputs.vivacity / -COLD_SPAN) + inputs.vivacity;
  return inputs.vivacity;
}

/** Exponent of the progressive branch of the form function. */
const PROGRESSIVE_EXPONENT = 0.3571;
/** Exponent of the degressive branch when a1 is outside [0.1, 0.9]. */
const DEFAULT_DEGRESSIVE_EXPONENT = 0.3051;
/** GRT caps z1 below 1. */
const MAXIMUM_Z1 = 0.99;
/** Resolution of GRT's search for the degressive scale zb. */
const SCALE_STEP = 0.0001;
/**
 * Largest zb searched for (10⁶ steps). Real powders need 1.07 to 1.86; a larger zb means burn
 * coefficients outside the model, for which GRT's search would run for hours.
 */
const MAXIMUM_SCALE = 100;

/**
 * The powder's form function φ(z), set up as GRT does: z1 capped, and the degressive branch scaled by
 * zb so that it continues the progressive branch at z1 (grt-traditional.md, Form function).
 */
export class FormFunction {
  private readonly a0: number;
  private readonly z1: number;
  private readonly z2: number;
  private readonly degressiveExponent: number;
  private readonly scale: number;

  constructor(inputs: GrtInputs) {
    this.a0 = inputs.a0;
    this.z1 = Math.min(MAXIMUM_Z1, inputs.z1);
    this.z2 = inputs.z2;
    this.degressiveExponent = inputs.a1 < 0.1 || inputs.a1 > 0.9 ? DEFAULT_DEGRESSIVE_EXPONENT : inputs.a1;
    this.scale = this.searchScale();
  }

  /**
   * True when the form function is defined: the progressive branch is positive up to z1 and a scale
   * zb within reach joins the degressive branch to it.
   */
  get isDefined(): boolean {
    const target = this.progressive(this.z1);
    return this.z1 > 0 && target > 0 && Number.isFinite(target) && this.degressive(this.z1) >= target;
  }

  /** True when z2 lies where GRT uses it as given, above z1 and at most 0.99. */
  get hasUsableZ2(): boolean {
    return this.z1 < this.z2 && !(this.z2 > MAXIMUM_Z1);
  }

  at(z: number): number {
    if (z > this.z1) return Math.max(this.degressive(this.z2), this.degressive(z));
    return this.progressive(z);
  }

  private progressive(z: number): number {
    return this.a0 === 0 ? 1 : (1 + this.a0 * z) ** PROGRESSIVE_EXPONENT;
  }

  private degressive(z: number, scale = this.scale): number {
    if (this.a0 === 0) return this.z1 === 1 ? 1 : scale * (1 - z) ** this.degressiveExponent;
    return scale * (Math.abs(this.a0) * (1 - z)) ** this.degressiveExponent;
  }

  /**
   * GRT's zb: increased by 0.0001 from 0 until the degressive branch reaches the progressive one at z1.
   * The repeated additions are kept, not replaced by a division, so that the rounding matches GRT's.
   */
  private searchScale(): number {
    let scale = 0;
    if (!(this.z1 > 0)) return scale;
    const target = this.progressive(this.z1);
    if (!(target > 0)) return scale;
    while (this.degressive(this.z1, scale) < target && scale <= MAXIMUM_SCALE) scale += SCALE_STEP;
    return scale;
  }
}

/**
 * The effective vivacity B: Ba₀·φ smoothed, averaged since ignition, scaled by the initial-pressure
 * factor and smoothed again (grt-traditional.md, Phase A, step 2).
 */
export class VivacitySmoother {
  private first: number;
  private second: number;
  private sum = 0;
  private count = 0;
  private readonly inputs: GrtInputs;

  constructor(ba0: number, inputs: GrtInputs) {
    this.first = ba0;
    this.second = ba0;
    this.inputs = inputs;
  }

  /** Feeds the step's unsmoothed vivacity Ba₀·φ and returns B. */
  next(vivacity: number): number {
    this.first = exponentialMean(this.first, vivacity, CONFIG.vivacityFirstSmoothing);
    this.sum += this.first;
    this.count += 1;
    // Multiplied in GRT's order (B₁ · F_Ba · p_s, p_s in bar), so that results match to the last bits.
    const factor = this.inputs.shotshell
      ? 1
      : this.first * CONFIG.vivacityInitialPressureFactor * this.inputs.initialPressure + 1;
    this.second = exponentialMean(this.second, factor * (this.sum / this.count), CONFIG.vivacitySecondSmoothing);
    return this.second;
  }
}

/** GRT's smoothing: the previous value weighted 1 − α, the new one α; a previous 0 means no history. */
export function exponentialMean(previous: number, value: number, alpha: number): number {
  return previous === 0 ? value : previous * (1 - alpha) + alpha * value;
}
