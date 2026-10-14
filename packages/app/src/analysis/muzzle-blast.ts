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
 * revolver's cylinder gap, muzzle devices and reflections are not included. Reviewed by Codex
 * (gpt-6.1-sol) on 2026-10-14. See docs/model/muzzle-blast.md.
 */

/** Standard atmosphere at sea level, Pa (ISO 2533). */
const SEA_LEVEL_PRESSURE = 101325;
/** Reference sound pressure for dB SPL, Pa. */
const REFERENCE_PRESSURE = 20e-6;
/** Fansler's model 2pb. */
const FIT = { momentumIndex: 0.78, linear: 0.11, quadratic: 0.0061, blowDown: 0.592 } as const;
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

/** Where the level is estimated: 1 m from the muzzle, square to the line of fire (MIL-STD-1474's bystander position is 1 m left of the muzzle). */
export const BLAST_POSITION = { distance: 1, angle: Math.PI / 2 } as const;

export interface MuzzleBlast {
  /** Peak overpressure, Pa. */
  peakOverpressure: number;
  /** The same as a peak sound pressure level, dB re 20 µPa. */
  level: number;
  /** True when the load or the position lies outside Fansler's small-arms data: uncertainty unknown. */
  extrapolated: boolean;
}

/** The blast at `distance` m from the muzzle, `angle` rad from the line of fire; undefined without a gas energy. */
export function muzzleBlast(
  load: Load,
  shot: Simulation,
  distance: number = BLAST_POSITION.distance,
  angle: number = BLAST_POSITION.angle,
): MuzzleBlast | undefined {
  const energy = shot.muzzleGasEnergy;
  if (energy === undefined || !(energy > 0) || !(shot.muzzleVelocity > 0)) return undefined;
  const ambient = SEA_LEVEL_PRESSURE;
  const length = Math.cbrt(energy / ambient);
  // The air's temperature is taken as the powder's (the load has no air temperature). L is the barrel
  // length from the breech face, Fansler's "effective length of the barrel".
  const blowDown = (load.barrel.length * speedOfSound(load.charge.temperature)) / (length * shot.muzzleVelocity);
  const { momentumIndex: mu } = FIT;
  const directivity = mu * Math.cos(angle) + Math.sqrt(1 - mu * mu * Math.sin(angle) ** 2);
  const scaled = (length * directivity * (1 + FIT.blowDown / blowDown)) / distance;
  const peakOverpressure = ambient * (FIT.linear * scaled + FIT.quadratic * scaled * scaled);
  const bore = load.cartridge.grooveDiameter;
  const within = (value: number, range: { from: number; to: number }) => value >= range.from && value <= range.to;
  const covered =
    within(length / bore, SMALL_ARMS_DATA.lengthOverBore) &&
    within(blowDown, SMALL_ARMS_DATA.blowDown) &&
    distance / bore >= SMALL_ARMS_DATA.calibers.from &&
    distance / bore < SMALL_ARMS_DATA.calibers.to;
  return {
    peakOverpressure,
    // Overpressure, not absolute pressure, against the 20 µPa reference.
    level: 20 * Math.log10(peakOverpressure / REFERENCE_PRESSURE),
    extrapolated: !covered,
  };
}
