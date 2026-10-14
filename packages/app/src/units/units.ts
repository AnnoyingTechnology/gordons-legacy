import { units } from '@gordons-legacy/formats';

/**
 * Display units. Loads hold SI values; every value shown or typed goes through a display unit chosen
 * per kind of quantity, so that a reloader can see charges in grains and lengths in millimetres if
 * they like. Metric and imperial presets set them all at once.
 */

/** The kinds of quantity the UI shows, each with its own choice of unit. */
export type QuantityKind =
  | 'length'
  | 'barrelLength'
  | 'twistLength'
  | 'area'
  | 'caseCapacity'
  | 'projectileMass'
  | 'chargeMass'
  | 'gunMass'
  | 'pressure'
  | 'temperature'
  | 'velocity'
  | 'energy'
  | 'specificEnergy'
  | 'density'
  | 'specificVolume'
  | 'time'
  | 'spinRate'
  | 'impulse'
  | 'ballisticCoefficient';

export interface DisplayUnit {
  /** Stable identifier, saved in preferences. */
  id: string;
  /** Symbol shown after values. */
  symbol: string;
  /** Converts an SI value to this unit. */
  fromSi: (value: number) => number;
  /** Converts a value in this unit to SI. */
  toSi: (value: number) => number;
  /** Decimals shown by default. */
  decimals: number;
}

function linear(id: string, symbol: string, siPerUnit: number, decimals: number): DisplayUnit {
  return { id, symbol, fromSi: (value) => value / siPerUnit, toSi: (value) => value * siPerUnit, decimals };
}

const MILLIMETRE = linear('mm', 'mm', units.MILLIMETRE, 2);
const INCH = linear('in', 'in', units.INCH, 3);
const GRAIN = linear('gr', 'gr', units.GRAIN, 1);
const GRAM = linear('g', 'g', units.GRAM, 3);
/** GRT shows case capacity as the mass of water it holds, taking 1 cm³ of water as 1 g. */
const GRAMS_OF_WATER = linear('g-h2o', 'g H₂O', units.CUBIC_CENTIMETRE, 3);
const GRAINS_OF_WATER = linear('gr-h2o', 'gr H₂O', units.CUBIC_CENTIMETRE * (units.GRAIN / units.GRAM), 1);

const UNITS: Record<QuantityKind, DisplayUnit[]> = {
  length: [MILLIMETRE, INCH],
  barrelLength: [linear('mm', 'mm', units.MILLIMETRE, 1), INCH],
  twistLength: [linear('mm', 'mm', units.MILLIMETRE, 0), linear('in', 'in', units.INCH, 1)],
  area: [linear('mm2', 'mm²', units.SQUARE_MILLIMETRE, 3), linear('in2', 'in²', units.INCH * units.INCH, 5)],
  caseCapacity: [linear('cm3', 'cm³', units.CUBIC_CENTIMETRE, 3), GRAMS_OF_WATER, GRAINS_OF_WATER],
  projectileMass: [GRAIN, linear('g', 'g', units.GRAM, 2)],
  chargeMass: [GRAM, linear('gr', 'gr', units.GRAIN, 2)],
  gunMass: [linear('kg', 'kg', 1, 2), linear('lb', 'lb', units.POUND, 2)],
  pressure: [linear('bar', 'bar', units.BAR, 0), linear('MPa', 'MPa', 1e6, 1), linear('psi', 'psi', 6894.757293168361, 0)],
  temperature: [
    { id: 'C', symbol: '°C', fromSi: units.kelvinToCelsius, toSi: units.celsiusToKelvin, decimals: 1 },
    {
      id: 'F',
      symbol: '°F',
      fromSi: (kelvin) => (units.kelvinToCelsius(kelvin) * 9) / 5 + 32,
      toSi: (fahrenheit) => units.celsiusToKelvin(((fahrenheit - 32) * 5) / 9),
      decimals: 1,
    },
  ],
  velocity: [linear('m/s', 'm/s', 1, 0), linear('ft/s', 'ft/s', 0.3048, 0)],
  energy: [linear('J', 'J', 1, 0), linear('ft-lbf', 'ft·lbf', 1.3558179483314004, 0)],
  specificEnergy: [linear('kJ/kg', 'kJ/kg', units.KILOJOULE_PER_KILOGRAM, 0)],
  density: [linear('kg/m3', 'kg/m³', 1, 0), linear('g/cm3', 'g/cm³', 1000, 3)],
  specificVolume: [linear('cm3/g', 'cm³/g', units.CUBIC_CENTIMETRE_PER_GRAM, 3)],
  time: [linear('ms', 'ms', 1e-3, 3)],
  // SI: revolutions per second.
  spinRate: [linear('rpm', 'rpm', 1 / 60, 0)],
  impulse: [linear('N-s', 'N·s', 1, 2), linear('lbf-s', 'lbf·s', 4.4482216152605, 3)],
  ballisticCoefficient: [linear('lb/in2', 'lb/in²', units.POUND_PER_SQUARE_INCH_MASS, 3), linear('kg/m2', 'kg/m²', 1, 1)],
};

/** The kinds a user can choose a unit for: those with more than one. */
export const CHOOSABLE_KINDS: readonly QuantityKind[] = (Object.keys(UNITS) as QuantityKind[]).filter(
  (kind) => UNITS[kind].length > 1,
);

export type UnitSystem = 'metric' | 'imperial';

/** The unit of each kind in each preset, by id. Kinds not listed use their first unit. */
const PRESETS: Record<UnitSystem, Partial<Record<QuantityKind, string>>> = {
  metric: { caseCapacity: 'cm3', projectileMass: 'g', chargeMass: 'g' },
  imperial: {
    length: 'in',
    barrelLength: 'in',
    twistLength: 'in',
    area: 'in2',
    caseCapacity: 'gr-h2o',
    projectileMass: 'gr',
    chargeMass: 'gr',
    gunMass: 'lb',
    pressure: 'psi',
    temperature: 'F',
    velocity: 'ft/s',
    energy: 'ft-lbf',
    impulse: 'lbf-s',
  },
};

/** The chosen unit of each kind, by id. */
export type UnitPreferences = Partial<Record<QuantityKind, string>>;

export function presetPreferences(system: UnitSystem): UnitPreferences {
  return { ...PRESETS[system] };
}

/** The units a kind can be shown in, the first being its default. */
export function unitsFor(kind: QuantityKind): readonly DisplayUnit[] {
  return UNITS[kind];
}

/** The unit chosen for a kind, falling back to its default when the preference is unknown. */
export function displayUnit(kind: QuantityKind, preferences: UnitPreferences): DisplayUnit {
  const options = UNITS[kind];
  return options.find((unit) => unit.id === preferences[kind]) ?? options[0]!;
}

/** Formats an SI value in the chosen unit, with its symbol: `formatQuantity(0.0007128, 'projectileMass', p)`. */
export function formatQuantity(value: number, kind: QuantityKind, preferences: UnitPreferences, locale = 'en'): string {
  const unit = displayUnit(kind, preferences);
  return `${formatNumber(unit.fromSi(value), unit.decimals, locale)} ${unit.symbol}`;
}

export function formatNumber(value: number, decimals: number, locale = 'en'): string {
  return value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Reads a number typed by a user, accepting a comma or a dot as decimal separator. Returns undefined
 * for anything that isn't a finite number.
 */
export function parseNumber(text: string): number | undefined {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}
