import {
  BAR,
  CUBIC_CENTIMETRE,
  CUBIC_CENTIMETRE_PER_GRAM,
  celsiusToKelvin,
  GRAIN,
  GRAM,
  KILOJOULE_PER_KILOGRAM,
  MILLIMETRE,
  SQUARE_MILLIMETRE,
} from '../units.ts';

/** Physical quantities found in GRT files. */
export type Quantity =
  | 'length'
  | 'area'
  | 'volume'
  | 'mass'
  | 'pressure'
  | 'specificEnergy'
  | 'density'
  | 'specificVolume'
  | 'temperature'
  | 'velocity';

export interface GrtUnit {
  quantity: Quantity;
  toSi: (value: number) => number;
  /**
   * Set when GRT writes this label for a value that is actually in another unit; the importer reports
   * it so the conversion is visible.
   */
  mislabelled?: string;
}

/** GRT's unit labels, as written in the `unit` attribute, with their conversion to SI. */
export const GRT_UNITS: Record<string, GrtUnit> = {
  mm: { quantity: 'length', toSi: (value) => value * MILLIMETRE },
  mm2: { quantity: 'area', toSi: (value) => value * SQUARE_MILLIMETRE },
  cm3: { quantity: 'volume', toSi: (value) => value * CUBIC_CENTIMETRE },
  g: { quantity: 'mass', toSi: (value) => value * GRAM },
  gr: { quantity: 'mass', toSi: (value) => value * GRAIN },
  kg: { quantity: 'mass', toSi: (value) => value },
  bar: { quantity: 'pressure', toSi: (value) => value * BAR },
  'kJ/kg': { quantity: 'specificEnergy', toSi: (value) => value * KILOJOULE_PER_KILOGRAM },
  'kg/m3': { quantity: 'density', toSi: (value) => value },
  'cm3/g': { quantity: 'specificVolume', toSi: (value) => value * CUBIC_CENTIMETRE_PER_GRAM },
  // Loads label the covolume cm³/kg, but the value is the same as in .propellant files, which say cm³/g,
  // and about 1 cm³/g is the physically plausible magnitude for powder gas.
  'cm3/kg': {
    quantity: 'specificVolume',
    toSi: (value) => value * CUBIC_CENTIMETRE_PER_GRAM,
    mislabelled: 'cm3/g',
  },
  Cel: { quantity: 'temperature', toSi: celsiusToKelvin },
  'm/s': { quantity: 'velocity', toSi: (value) => value },
};
