import { seatingDepth, standardMaxPressures, type Load, type ProjectileBase, type StandardMaxPressures } from '@gordons-legacy/formats';
import { combustionChamber, guidedSeatingDepth, travelToMuzzle } from '@gordons-legacy/engine';
import type { MessageKey } from '../i18n/i18n.ts';
import type { QuantityKind } from '../units/units.ts';
import type { UiContext } from '../components/context.ts';

/**
 * The editable values of a load, grouped as in GRT's input panels. Each field says how to read its
 * value from a load and how to write a new one, without mutating the load.
 */
export interface NumberField {
  type: 'number';
  label: MessageKey;
  /** The unit kind, or 'plain' for dimensionless values. */
  kind: QuantityKind | 'plain';
  get: (load: Load) => number | undefined;
  set: (load: Load, value: number) => Load;
  /** Decimals for plain values. */
  decimals?: number;
  /** Whether 0 or less is meaningless (masses, lengths…). */
  positive?: boolean;
  /** Where the value sits in the load, as the engine names it when it reports a problem. */
  path?: string;
  /** An assistant that computes the value from other measurements. */
  assistant?: 'boreArea';
  /** A hint shown with the field: typical values, or what to measure. */
  help?: MessageKey;
  /** Shown only when this holds (for example, a boat-tail's length only for a boat-tail). */
  visible?: (load: Load) => boolean;
  /** For an optional value: removes it when the field is emptied. */
  clear?: (load: Load) => Load;
}

/** One of a fixed set of values, chosen from a list. */
export interface ChoiceField {
  type: 'choice';
  label: MessageKey;
  options: Array<{ value: string; label: MessageKey }>;
  get: (load: Load) => string;
  set: (load: Load, value: string) => Load;
}

export interface TextField {
  type: 'text';
  label: MessageKey;
  get: (load: Load) => string;
  set?: (load: Load, value: string) => Load;
}

/**
 * A value the load does not store, shown beside the inputs it follows from: GRT shows these too, and a
 * reloader reads them to judge what they typed.
 */
export interface DerivedField {
  type: 'derived';
  label: MessageKey;
  kind: QuantityKind;
  get: (load: Load) => number;
  help?: MessageKey;
  /** Shown only when this holds; a value equal to one above it is noise. */
  visible?: (load: Load) => boolean;
}

export type Field = NumberField | TextField | ChoiceField | DerivedField;

export interface FieldGroup {
  title: MessageKey;
  /** The few values the group still shows when it is folded away (issue #25). */
  summary: (load: Load, context: UiContext) => string;
  fields: Field[];
}

/** Values of a folded group, the empty ones left out. */
function folded(...values: Array<string | undefined>): string {
  return values.filter((value) => value !== undefined && value.trim() !== '').join(' · ');
}

const number = (field: Omit<NumberField, 'type'>): NumberField => ({ type: 'number', ...field });

/** What a number field says about itself; its path, getter and setter follow from where it sits. */
type FieldOptions = Omit<NumberField, 'type' | 'path' | 'get' | 'set'>;

type LoadPart = 'cartridge' | 'barrel' | 'projectile' | 'propellant' | 'charge';

/** The keys of a part of the load that hold a number. */
type NumberKey<Part extends LoadPart> = {
  [Key in keyof Load[Part]]-?: Exclude<Load[Part][Key], undefined> extends number ? Key : never;
}[keyof Load[Part]] &
  string;

/** A number of one part of the load (`cartridge.caseLength`…), read and written by its key. */
function partNumber<Part extends LoadPart>(part: Part, key: NumberKey<Part>, options: FieldOptions): NumberField {
  return number({
    ...options,
    path: `${part}.${key}`,
    get: (load) => load[part][key] as number | undefined,
    set: (load, value) => ({ ...load, [part]: { ...load[part], [key]: value } }),
  });
}

type BurnModel = Load['propellant']['burnModel'];

/** The coefficients of the powder's GRT burn model. */
type BurnModelKey = { [Key in keyof BurnModel]-?: BurnModel[Key] extends number ? Key : never }[keyof BurnModel] & string;

/** A coefficient of the powder's GRT burn model. */
function burnModelNumber(key: BurnModelKey, options: FieldOptions): NumberField {
  return number({
    ...options,
    path: `propellant.burnModel.${key}`,
    get: (load) => load.propellant.burnModel[key],
    set: (load, value) => withBurnModel(load, { [key]: value }),
  });
}

/** A standard's maximum pressure: shown as known (entered, or from the caliber definition), stored when entered. */
function standardPressureField(standard: keyof StandardMaxPressures, label: MessageKey): NumberField {
  const withValue = (load: Load, value: number | undefined): Load => {
    const { [standard]: _replaced, ...others } = load.cartridge.standardMaxPressures ?? {};
    const entries: StandardMaxPressures = value === undefined ? others : { ...others, [standard]: value };
    const { standardMaxPressures: _old, ...cartridge } = load.cartridge;
    return { ...load, cartridge: Object.keys(entries).length === 0 ? cartridge : { ...cartridge, standardMaxPressures: entries } };
  };
  return number({
    path: `cartridge.standardMaxPressures.${standard}`,
    help: 'help.standardMaxPressures',
    label,
    kind: 'pressure',
    positive: true,
    get: (l) => standardMaxPressures(l.cartridge)[standard],
    set: (l, v) => withValue(l, v),
    clear: (l) => withValue(l, undefined),
  });
}

const BASE_SHAPES: ProjectileBase['shape'][] = ['flat', 'boattail', 'hollow', 'hollow-round'];
const BASE_DIMENSIONS = [
  ['length', 'field.baseLength'],
  ['diameterA', 'field.baseDiameterA'],
  ['diameterB', 'field.baseDiameterB'],
] as const;

export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'group.cartridge',
    summary: (load, { quantity }) => folded(load.cartridge.name, quantity(load.cartridge.maxPressure, 'pressure')),
    fields: [
      { type: 'text', label: 'field.name', get: (l) => l.cartridge.name, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, name: v } }) },
      partNumber('cartridge', 'caseCapacity', { help: 'help.caseCapacity', label: 'field.caseCapacity', kind: 'caseCapacity', positive: true }),
      { type: 'derived', label: 'field.combustionChamber', kind: 'caseCapacity', get: combustionChamber, help: 'help.combustionChamber' },
      partNumber('cartridge', 'caseLength', { label: 'field.caseLength', kind: 'length', positive: true }),
      partNumber('cartridge', 'overallLength', { label: 'field.overallLength', kind: 'length', positive: true }),
      partNumber('cartridge', 'grooveDiameter', { label: 'field.grooveDiameter', kind: 'length', positive: true }),
      partNumber('cartridge', 'effectiveBoreArea', { help: 'help.effectiveBoreArea', assistant: 'boreArea', label: 'field.effectiveBoreArea', kind: 'area', positive: true }),
      partNumber('cartridge', 'maxPressure', { label: 'field.maxPressure', kind: 'pressure', positive: true }),
      standardPressureField('cip', 'field.cipMaxPressure'),
      standardPressureField('saami', 'field.saamiMaxPressure'),
      partNumber('cartridge', 'sebertFactor', { help: 'help.sebertFactor', label: 'field.sebertFactor', kind: 'plain', decimals: 2 }),
    ],
  },
  {
    title: 'group.barrel',
    summary: (load, { quantity }) => folded(load.barrel.name, quantity(load.barrel.length, 'barrelLength')),
    fields: [
      { type: 'text', label: 'field.name', get: (l) => l.barrel.name, set: (l, v) => ({ ...l, barrel: { ...l.barrel, name: v } }) },
      partNumber('barrel', 'length', { label: 'field.barrelLength', kind: 'barrelLength', positive: true }),
      { type: 'derived', label: 'field.travelToMuzzle', kind: 'barrelLength', get: travelToMuzzle, help: 'help.travelToMuzzle' },
      partNumber('barrel', 'twistLength', { label: 'field.twistLength', kind: 'twistLength', positive: true }),
      number({
        path: 'barrel.gunMass',
        label: 'field.gunMass',
        kind: 'gunMass',
        get: (l) => l.barrel.gunMass,
        // 0 removes it: recoil is then given without the gun's motion.
        set: (l, v) => {
          const { gunMass: _removed, ...barrel } = l.barrel;
          return { ...l, barrel: v > 0 ? { ...barrel, gunMass: v } : barrel };
        },
      }),
      // 0 removes the jump.
      number({
        path: 'barrel.jumpToLands',
        label: 'field.jumpToLands',
        kind: 'length',
        get: (l) => l.barrel.jumpToLands,
        set: (l, v) => {
          const { jumpToLands: _removed, ...barrel } = l.barrel;
          return { ...l, barrel: v > 0 ? { ...barrel, jumpToLands: v } : barrel };
        },
      }),
    ],
  },
  {
    title: 'group.projectile',
    summary: (load, { quantity }) => folded(load.projectile.name, quantity(load.projectile.mass, 'projectileMass')),
    fields: [
      { type: 'text', label: 'field.name', get: (l) => l.projectile.name, set: (l, v) => ({ ...l, projectile: { ...l.projectile, name: v } }) },
      partNumber('projectile', 'mass', { label: 'field.mass', kind: 'projectileMass', positive: true }),
      partNumber('projectile', 'diameter', { label: 'field.diameter', kind: 'length', positive: true }),
      partNumber('projectile', 'length', { label: 'field.length', kind: 'length', positive: true }),
      {
        type: 'choice',
        label: 'field.base',
        options: BASE_SHAPES.map((shape) => ({ value: shape, label: `base.${shape}` as const })),
        get: (l) => l.projectile.base.shape,
        set: (l, v) => withBase(l, v as ProjectileBase['shape']),
      },
      ...BASE_DIMENSIONS.map(([key, label]) =>
        number({
          path: `projectile.base.${key}`,
          label,
          kind: 'length',
          visible: (l) => l.projectile.base.shape !== 'flat',
          get: (l) => (l.projectile.base.shape === 'flat' ? undefined : l.projectile.base[key]),
          set: (l, v) => (l.projectile.base.shape === 'flat' ? l : { ...l, projectile: { ...l.projectile, base: { ...l.projectile.base, [key]: v } } }),
        }),
      ),
      // The seating depth isn't stored: setting it moves the overall length, as in GRT.
      number({
        path: 'cartridge.overallLength',
        label: 'field.seatingDepth',
        kind: 'length',
        get: (l) => seatingDepth(l),
        set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, overallLength: l.cartridge.caseLength + l.projectile.length - v } }),
      }),
      {
        type: 'derived',
        label: 'field.guidedSeatingDepth',
        kind: 'length',
        get: guidedSeatingDepth,
        help: 'help.guidedSeatingDepth',
        visible: (l) => l.projectile.base.shape === 'boattail',
      },
      partNumber('projectile', 'shotStartPressure', { help: 'help.shotStartPressure', label: 'field.shotStartPressure', kind: 'pressure', positive: true }),
      // GRT's `gfriction`: imported with the load, and until now invisible although it changes the result.
      number({
        path: 'projectile.boreResistanceAdjustment',
        label: 'field.boreResistance',
        help: 'help.boreResistance',
        kind: 'pressure',
        get: (l) => l.projectile.boreResistanceAdjustment,
        set: (l, v) => ({ ...l, projectile: { ...l.projectile, boreResistanceAdjustment: v } }),
        clear: (l) => {
          const { boreResistanceAdjustment: _dropped, ...projectile } = l.projectile;
          return { ...l, projectile };
        },
      }),
    ],
  },
  {
    title: 'group.propellant',
    summary: (load, { quantity }) => folded(`${load.propellant.maker} ${load.propellant.product}`, quantity(load.charge.mass, 'chargeMass')),
    fields: [
      { type: 'text', label: 'field.name', get: (l) => `${l.propellant.maker} ${l.propellant.product}`.trim() },
      burnModelNumber('vivacity', { help: 'help.vivacity', label: 'field.vivacity', kind: 'plain', decimals: 4, positive: true }),
      burnModelNumber('a0', { help: 'help.a0', label: 'field.a0', kind: 'plain', decimals: 4 }),
      burnModelNumber('z1', { help: 'help.z1', label: 'field.z1', kind: 'plain', decimals: 4 }),
      burnModelNumber('z2', { help: 'help.z2', label: 'field.z2', kind: 'plain', decimals: 4 }),
      burnModelNumber('coldTemperatureCoefficient', { help: 'help.temperatureCoefficients', label: 'field.coldTemperatureCoefficient', kind: 'plain', decimals: 4 }),
      burnModelNumber('hotTemperatureCoefficient', { help: 'help.temperatureCoefficients', label: 'field.hotTemperatureCoefficient', kind: 'plain', decimals: 4 }),
      partNumber('propellant', 'heatOfExplosion', { help: 'help.heatOfExplosion', label: 'field.heatOfExplosion', kind: 'specificEnergy', positive: true }),
      partNumber('propellant', 'heatCapacityRatio', { help: 'help.heatCapacityRatio', label: 'field.heatCapacityRatio', kind: 'plain', decimals: 4, positive: true }),
      partNumber('propellant', 'grainDensity', { help: 'help.grainDensity', label: 'field.grainDensity', kind: 'density', positive: true }),
      partNumber('propellant', 'bulkDensity', { help: 'help.bulkDensity', label: 'field.bulkDensity', kind: 'density', positive: true }),
    ],
  },
  {
    title: 'group.charge',
    summary: (load, { quantity }) => folded(quantity(load.charge.mass, 'chargeMass'), quantity(load.charge.temperature, 'temperature')),
    fields: [
      partNumber('charge', 'mass', { label: 'field.chargeMass', kind: 'chargeMass', positive: true }),
      partNumber('charge', 'temperature', { label: 'field.temperature', kind: 'temperature', positive: true }),
      number({
        label: 'field.ladderSteps',
        kind: 'plain',
        decimals: 0,
        get: (l) => l.ladder?.steps ?? 1,
        // Without a ladder yet, the step defaults to 1 % of the charge, so that this field alone makes one.
        set: (l, v) => withLadder(l, Math.round(v), l.ladder?.massStep ?? l.charge.mass * DEFAULT_LADDER_STEP),
      }),
      number({
        label: 'field.ladderStep',
        kind: 'chargeMass',
        get: (l) => l.ladder?.massStep ?? 0,
        set: (l, v) => withLadder(l, l.ladder?.steps ?? DEFAULT_LADDER_CHARGES, v),
      }),
    ],
  },
];

/** Whether a problem the engine reports at `path` concerns this field (also when `path` is a parent). */
export function fieldConcerns(field: Field, path: string | undefined): boolean {
  if (field.type !== 'number' || field.path === undefined || path === undefined) return false;
  return field.path === path || field.path.startsWith(`${path}.`);
}

/** The field the editor shows for exactly this path, if any. */
export function fieldAt(path: string | undefined): NumberField | undefined {
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) if (field.type === 'number' && field.path === path) return field;
  }
  return undefined;
}

/** The load with another base shape, keeping the dimensions when there were some. */
function withBase(load: Load, shape: ProjectileBase['shape']): Load {
  const current = load.projectile.base;
  const dimensions = current.shape === 'flat' ? { length: 0, diameterA: 0, diameterB: 0 } : current;
  const base: ProjectileBase =
    shape === 'flat' ? { shape } : { shape, length: dimensions.length, diameterA: dimensions.diameterA, diameterB: dimensions.diameterB };
  return { ...load, projectile: { ...load.projectile, base } };
}

function withBurnModel(load: Load, change: Partial<Load['propellant']['burnModel']>): Load {
  return { ...load, propellant: { ...load.propellant, burnModel: { ...load.propellant.burnModel, ...change } } };
}

/** Defaults when one ladder field is set before the other: 5 charges, each 1 % of the charge apart. */
const DEFAULT_LADDER_CHARGES = 5;
const DEFAULT_LADDER_STEP = 0.01;

/** A ladder with fewer than two charges, or no step, is no ladder. */
function withLadder(load: Load, steps: number, massStep: number): Load {
  const { ladder: _removed, ...rest } = load;
  return steps >= 2 && massStep > 0 ? { ...rest, ladder: { steps: Math.min(10, steps), massStep } } : rest;
}
