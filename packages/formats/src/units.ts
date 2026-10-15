/**
 * SI conversion factors. Every quantity in Gordon's Legacy is stored in SI base units (m, kg, s, Pa, K,
 * and their products); these constants convert the practical and imperial units found in GRT files and
 * shown in the UI. Multiply a value in the named unit by the constant to get SI.
 */

export const MILLIMETRE = 1e-3; // m
export const INCH = 0.0254; // m
export const SQUARE_MILLIMETRE = 1e-6; // m²
export const CUBIC_CENTIMETRE = 1e-6; // m³
export const GRAM = 1e-3; // kg
export const GRAIN = 64.79891e-6; // kg, exact by definition
export const POUND = 0.45359237; // kg, exact by definition
/** g₀, m/s², exact by definition: what turns a pound of mass into a pound of force. */
export const STANDARD_GRAVITY = 9.80665;
export const BAR = 1e5; // Pa
/** Pounds-force per square inch, the unit American makers publish pressures in: 6,894.757 Pa. */
export const PSI = (POUND * STANDARD_GRAVITY) / (INCH * INCH); // Pa
/** Feet per second, the unit American makers publish velocities in. */
export const FOOT_PER_SECOND = 0.3048; // m/s
export const KILOJOULE_PER_KILOGRAM = 1e3; // J/kg
export const CUBIC_CENTIMETRE_PER_GRAM = 1e-3; // m³/kg

/** Ballistic coefficients are published in lb/in²; this converts them to kg/m². */
export const POUND_PER_SQUARE_INCH_MASS = POUND / (INCH * INCH); // kg/m²

export const ZERO_CELSIUS = 273.15; // K

export function celsiusToKelvin(celsius: number): number {
  return celsius + ZERO_CELSIUS;
}

export function kelvinToCelsius(kelvin: number): number {
  return kelvin - ZERO_CELSIUS;
}
