import { units } from '@gordons-legacy/formats';

/**
 * Formats SI values in the units reloaders read. Metric only for now; the metric/imperial switch comes
 * with the full UI (milestone M3).
 */

function decimals(value: number, fractionDigits: number): string {
  return value.toLocaleString('en', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

export function formatLength(metres: number): string {
  return `${decimals(metres / units.MILLIMETRE, 2)} mm`;
}

export function formatArea(squareMetres: number): string {
  return `${decimals(squareMetres / units.SQUARE_MILLIMETRE, 3)} mm²`;
}

export function formatVolume(cubicMetres: number): string {
  return `${decimals(cubicMetres / units.CUBIC_CENTIMETRE, 3)} cm³`;
}

/** Grams with grains alongside, since both are common at the bench. */
export function formatMass(kilograms: number): string {
  return `${decimals(kilograms / units.GRAM, 3)} g (${decimals(kilograms / units.GRAIN, 2)} gr)`;
}

export function formatPressure(pascals: number): string {
  return `${decimals(pascals / units.BAR, 0)} bar`;
}

export function formatTemperature(kelvin: number): string {
  return `${decimals(units.kelvinToCelsius(kelvin), 1)} °C`;
}

export function formatSpecificEnergy(joulesPerKilogram: number): string {
  return `${decimals(joulesPerKilogram / units.KILOJOULE_PER_KILOGRAM, 0)} kJ/kg`;
}

export function formatDensity(kilogramsPerCubicMetre: number): string {
  return `${decimals(kilogramsPerCubicMetre, 0)} kg/m³`;
}

export function formatSpecificVolume(cubicMetresPerKilogram: number): string {
  return `${decimals(cubicMetresPerKilogram / units.CUBIC_CENTIMETRE_PER_GRAM, 3)} cm³/g`;
}

export function formatVelocity(metresPerSecond: number): string {
  return `${decimals(metresPerSecond, 0)} m/s`;
}

/** Ballistic coefficients are published in lb/in². */
export function formatBallisticCoefficient(kilogramsPerSquareMetre: number): string {
  return decimals(kilogramsPerSquareMetre / units.POUND_PER_SQUARE_INCH_MASS, 3);
}

/** A dimensionless number with up to `digits` significant digits. */
export function formatNumber(value: number, digits = 4): string {
  return value.toLocaleString('en', { maximumSignificantDigits: digits });
}
