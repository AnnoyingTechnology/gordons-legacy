/**
 * The speed of sound in air, and the band around it where a bullet's flight is disturbed.
 *
 * For an ideal gas the speed of sound depends on temperature only, not on atmospheric pressure:
 * c = √(γ R T / M). Humidity raises it by well under 1 %, which is ignored here.
 */

/** Ratio of specific heats of dry air. */
const AIR_HEAT_CAPACITY_RATIO = 1.4;
/** Molar gas constant, J/(mol·K) (CODATA 2018). */
const GAS_CONSTANT = 8.314462618;
/** Molar mass of dry air, kg/mol (ISO 2533 standard atmosphere). */
const AIR_MOLAR_MASS = 0.0289644;

/** Speed of sound in dry air at the given temperature, m/s. 340.3 m/s at 15 °C (ISO 2533). */
export function speedOfSound(temperature: number): number {
  return Math.sqrt((AIR_HEAT_CAPACITY_RATIO * GAS_CONSTANT * temperature) / AIR_MOLAR_MASS);
}

/**
 * The transonic band, as Mach numbers. The standard drag functions (G1, G7) rise steeply near Mach 1 and
 * peak just above it: a bullet that leaves the muzzle in this band, or slows through it soon after, is
 * buffeted and loses accuracy. Below Mach 0.95 a subsonic load keeps a margin to its crack that ordinary
 * changes don't eat: the speed of sound moves by about 0.17 % per kelvin, and the velocity with the
 * powder's temperature.
 */
export const TRANSONIC_BAND = { from: 0.95, to: 1.1 } as const;

/** Where a velocity sits against the speed of sound at a temperature. */
export type SpeedRegime = 'subsonic' | 'transonic' | 'supersonic';

export function speedRegime(velocity: number, temperature: number): SpeedRegime {
  const mach = velocity / speedOfSound(temperature);
  if (mach < TRANSONIC_BAND.from) return 'subsonic';
  return mach <= TRANSONIC_BAND.to ? 'transonic' : 'supersonic';
}
