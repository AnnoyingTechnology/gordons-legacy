import { units } from '@gordons-legacy/formats';

/**
 * The unit converter's units (GRT's unit-of-measure calculator), by dimension: the units reloaders
 * meet in manuals and on scales. Each converts to and from SI.
 */
export interface ConverterUnit {
  id: string;
  symbol: string;
  toSi: (value: number) => number;
  fromSi: (value: number) => number;
}

function linear(id: string, symbol: string, siPerUnit: number): ConverterUnit {
  return { id, symbol, toSi: (value) => value * siPerUnit, fromSi: (value) => value / siPerUnit };
}

/** Avoirdupois ounce and pound, kg. */
const OUNCE = 0.028349523125;

export const CONVERSIONS = {
  mass: [
    linear('gr', 'gr', units.GRAIN),
    linear('g', 'g', units.GRAM),
    linear('kg', 'kg', 1),
    linear('oz', 'oz', OUNCE),
    linear('lb', 'lb', units.POUND),
  ],
  length: [
    linear('mm', 'mm', units.MILLIMETRE),
    linear('cm', 'cm', 0.01),
    linear('m', 'm', 1),
    linear('in', 'in', units.INCH),
    linear('ft', 'ft', 0.3048),
    linear('yd', 'yd', 0.9144),
  ],
  velocity: [linear('m/s', 'm/s', 1), linear('ft/s', 'ft/s', 0.3048), linear('km/h', 'km/h', 1 / 3.6), linear('mph', 'mph', 0.44704)],
  pressure: [linear('bar', 'bar', units.BAR), linear('MPa', 'MPa', 1e6), linear('kPa', 'kPa', 1e3), linear('psi', 'psi', 6894.757293168361)],
  energy: [linear('J', 'J', 1), linear('ft-lbf', 'ft·lbf', 1.3558179483314004)],
  temperature: [
    { id: 'C', symbol: '°C', toSi: units.celsiusToKelvin, fromSi: units.kelvinToCelsius },
    { id: 'F', symbol: '°F', toSi: (value: number) => units.celsiusToKelvin(((value - 32) * 5) / 9), fromSi: (value: number) => (units.kelvinToCelsius(value) * 9) / 5 + 32 },
    linear('K', 'K', 1),
  ],
  volume: [
    linear('cm3', 'cm³', units.CUBIC_CENTIMETRE),
    // Case capacity as water: 1 cm³ of water taken as 1 g, as GRT does.
    linear('gr-h2o', 'gr H₂O', units.CUBIC_CENTIMETRE * (units.GRAIN / units.GRAM)),
    linear('in3', 'in³', units.INCH ** 3),
  ],
} satisfies Record<string, ConverterUnit[]>;

export type ConverterDimension = keyof typeof CONVERSIONS;

/** `value` in `from` expressed in every unit of the dimension. */
export function convertAll(dimension: ConverterDimension, value: number, from: string): Array<{ unit: ConverterUnit; value: number }> {
  const list: ConverterUnit[] = CONVERSIONS[dimension];
  const source = list.find((unit) => unit.id === from);
  if (!source) return [];
  const si = source.toSi(value);
  return list.map((unit) => ({ unit, value: unit.fromSi(si) }));
}
