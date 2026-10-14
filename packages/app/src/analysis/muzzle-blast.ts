import type { Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { speedOfSound } from './speed-of-sound.ts';

/**
 * The muzzle blast's peak sound level beside an unsuppressed gun, from the energy left in the powder gas
 * at the muzzle. Fansler's modified point-source scaling, fitted to measured blast waves of 7.62 mm rifle
 * and carbine barrels from 15 to 400 calibers (K. S. Fansler, "Description of muzzle blast by modified
 * ideal scaling models", Shock and Vibration 5, 1998, model 2pb):
 *
 *   λ = (E / p₀)^⅓, the point-source length; δ = L a₀ / (λ v₀), the barrel's blow-down time over the blast's;
 *   β(θ) = μ cos θ + √(1 − μ² sin² θ), μ = 0.78, the blast's directivity (θ from the line of fire);
 *   λ′ = λ β (1 + 0.592 / δ);  P / p₀ = 0.11 (λ′ / r) + 0.0061 (λ′ / r)².
 *
 * The fit's RMS error on ln P is 0.201, 1.75 dB, within its data; outside them (handguns, short or wide
 * bores) the uncertainty is unknown. A bare muzzle in free field: the bullet's ballistic crack, a
 * revolver's cylinder gap, muzzle devices and reflections other than the ground's are not included. Reviewed by Codex
 * (gpt-6.1-sol) on 2026-10-14. See docs/model/muzzle-blast.md.
 *
 * Near the ground, its echo adds: the muzzle's image under the ground sends a second, later wave, and the
 * two waves (assumed Friedlander shapes matching Fansler's peak and impulse fits) add linearly at the
 * listener. An unvalidated approximation: near the muzzle the reflection of these weak shocks may not be
 * linear (Mach stems), and the combined level carries more than the peak fit's 1.75 dB uncertainty.
 */

/** Standard atmosphere at sea level, Pa (ISO 2533). */
const SEA_LEVEL_PRESSURE = 101325;
/** Reference sound pressure for dB SPL, Pa. */
const REFERENCE_PRESSURE = 20e-6;
/** Fansler's model 2pb. */
const FIT = { momentumIndex: 0.78, linear: 0.11, quadratic: 0.0061, blowDown: 0.592 } as const;
/** Fansler's impulse fit, eqs 27-30: bᵢ = 0.954 − 0.585 sin(θ/2); λᵢ′ = β (1 + 0.444 sin(θ/2) / δ) λ. */
const IMPULSE_FIT = { coefficient: 0.0146, exponent: 0.954, exponentSlope: 0.585, blowDown: 0.444 } as const;
/**
 * The small-arms data behind the fit (Fansler's table 2, the five 7.62 mm firings): point-source length
 * over bore, blow-down parameter, and distance in calibers (from 15; the 400-caliber gauges were left
 * out of the fit). A load outside these is an extrapolation.
 */
export const SMALL_ARMS_DATA = {
  lengthOverBore: { from: 39.8, to: 63.8 },
  blowDown: { from: 0.437, to: 0.712 },
  calibers: { from: 15, to: 400 },
} as const;

/**
 * Where the blast is heard: distance and angle from the muzzle, and the muzzle's height above the ground,
 * whose echo adds to the direct blast when it arrives before the blast has passed. The listener is at the
 * muzzle's height. Without a height, free field (no ground).
 */
export interface BlastPosition {
  /** m. */
  distance: number;
  /** From the line of fire, rad. */
  angle: number;
  /** Muzzle above the ground, m. */
  muzzleHeight?: number;
  /**
   * The ground's reflection as a single factor: 1 for rigid ground (concrete, asphalt, the scenario
   * shown). Real grass or soil has a frequency-dependent impedance that one number only approximates.
   */
  groundReflection?: number;
}

/**
 * Typical muzzle heights, m: prone on a bipod (the maintainer's 20 cm), at a bench, standing. The echo
 * matters only near the ground: at a bench or standing it arrives after the blast has passed.
 */
export const MUZZLE_HEIGHTS = { prone: 0.2, bench: 1.1, standing: 1.5 } as const;

/** What the app shows: 1 m beside the muzzle, prone, over rigid ground (softer ground reflects less). */
export const SHOWN_POSITION: BlastPosition = { distance: 1, angle: Math.PI / 2, muzzleHeight: MUZZLE_HEIGHTS.prone, groundReflection: 1 };

export interface MuzzleBlast {
  /** Peak overpressure, Pa. */
  peakOverpressure: number;
  /** The same as a peak sound pressure level, dB re 20 µPa. */
  level: number;
  /** What the ground's echo adds to the free-field level, dB. */
  groundGain: number;
  /** True when the load or the position lies outside Fansler's small-arms data: uncertainty unknown. */
  extrapolated: boolean;
}

/** The blast wave from the muzzle at one field point: its peak overpressure, Pa, and positive-phase duration, s. */
interface Wave {
  peak: number;
  duration: number;
}

/** The muzzle blast at a position; undefined without a gas energy. */
export function muzzleBlast(load: Load, shot: Simulation, position: BlastPosition = SHOWN_POSITION): MuzzleBlast | undefined {
  const energy = shot.muzzleGasEnergy;
  if (energy === undefined || !(energy > 0) || !(shot.muzzleVelocity > 0)) return undefined;
  const ambient = SEA_LEVEL_PRESSURE;
  const sound = speedOfSound(load.charge.temperature);
  const length = Math.cbrt(energy / ambient);
  // The air's temperature is taken as the powder's (the load has no air temperature). L is the barrel
  // length from the breech face, Fansler's "effective length of the barrel".
  const blowDown = (load.barrel.length * sound) / (length * shot.muzzleVelocity);
  const { distance, angle } = position;

  const wave = (range: number, theta: number): Wave => {
    const { momentumIndex: mu } = FIT;
    const directivity = mu * Math.cos(theta) + Math.sqrt(1 - mu * mu * Math.sin(theta) ** 2);
    const scaled = (length * directivity * (1 + FIT.blowDown / blowDown)) / range;
    const peak = ambient * (FIT.linear * scaled + FIT.quadratic * scaled * scaled);
    // Fansler's impulse fit (eqs 27-30): I a₀ / (λᵢ′ p₀) = 0.0146 (λᵢ′ / r)^bᵢ, with its own modified length.
    const half = Math.sin(theta / 2);
    const impulseLength = directivity * (1 + (IMPULSE_FIT.blowDown * half) / blowDown) * length;
    const impulse = (IMPULSE_FIT.coefficient * (impulseLength / range) ** (IMPULSE_FIT.exponent - IMPULSE_FIT.exponentSlope * half) * impulseLength * ambient) / sound;
    // An assumed Friedlander wave p(t) = P (1 − t/τ) e^(−t/τ), matching the peak and the impulse P τ / e:
    // Fansler leaves the duration itself unpredicted, so the shape is an assumption.
    return { peak, duration: (impulse * Math.E) / peak };
  };

  const direct = wave(distance, angle);
  let peakOverpressure = direct.peak;
  const height = position.muzzleHeight;
  if (height !== undefined && height >= 0) {
    // The echo comes from the muzzle's image under the ground: farther, later, and at the angle the
    // image sees the listener (the listener at the muzzle's height).
    const across = distance * Math.sin(angle);
    const along = distance * Math.cos(angle);
    const imageRange = Math.hypot(along, across, 2 * height);
    const echo = wave(imageRange, Math.acos(along / imageRange));
    const delay = (imageRange - distance) / sound;
    const reflection = position.groundReflection ?? 1;
    peakOverpressure = Math.max(direct.peak, friedlander(direct, delay) + reflection * echo.peak);
  }

  const bore = load.cartridge.grooveDiameter;
  const within = (value: number, range: { from: number; to: number }) => value >= range.from && value <= range.to;
  const covered =
    within(length / bore, SMALL_ARMS_DATA.lengthOverBore) &&
    within(blowDown, SMALL_ARMS_DATA.blowDown) &&
    distance / bore >= SMALL_ARMS_DATA.calibers.from &&
    distance / bore < SMALL_ARMS_DATA.calibers.to;
  const level = (pressure: number) => 20 * Math.log10(pressure / REFERENCE_PRESSURE);
  return {
    peakOverpressure,
    // Overpressure, not absolute pressure, against the 20 µPa reference.
    level: level(peakOverpressure),
    groundGain: level(peakOverpressure) - level(direct.peak),
    extrapolated: !covered,
  };
}

/** A Friedlander wave's overpressure `time` s after its arrival (0 once its positive phase is over). */
function friedlander(wave: Wave, time: number): number {
  const phase = time / wave.duration;
  return phase >= 1 ? 0 : wave.peak * (1 - phase) * Math.exp(-phase);
}
