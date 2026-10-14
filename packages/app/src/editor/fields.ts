import { seatingDepth, type Load } from '@gordons-legacy/formats';
import type { MessageKey } from '../i18n/i18n.ts';
import type { QuantityKind } from '../units/units.ts';

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
}

export interface TextField {
  type: 'text';
  label: MessageKey;
  get: (load: Load) => string;
  set?: (load: Load, value: string) => Load;
}

export type Field = NumberField | TextField;

export interface FieldGroup {
  title: MessageKey;
  fields: Field[];
}

const number = (field: Omit<NumberField, 'type'>): NumberField => ({ type: 'number', ...field });

export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'group.cartridge',
    fields: [
      { type: 'text', label: 'field.name', get: (l) => l.cartridge.name, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, name: v } }) },
      number({ path: 'cartridge.caseCapacity', label: 'field.caseCapacity', kind: 'caseCapacity', positive: true, get: (l) => l.cartridge.caseCapacity, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, caseCapacity: v } }) }),
      number({ path: 'cartridge.caseLength', label: 'field.caseLength', kind: 'length', positive: true, get: (l) => l.cartridge.caseLength, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, caseLength: v } }) }),
      number({ path: 'cartridge.overallLength', label: 'field.overallLength', kind: 'length', positive: true, get: (l) => l.cartridge.overallLength, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, overallLength: v } }) }),
      number({ path: 'cartridge.grooveDiameter', label: 'field.grooveDiameter', kind: 'length', positive: true, get: (l) => l.cartridge.grooveDiameter, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, grooveDiameter: v } }) }),
      number({ path: 'cartridge.effectiveBoreArea', assistant: 'boreArea', label: 'field.effectiveBoreArea', kind: 'area', positive: true, get: (l) => l.cartridge.effectiveBoreArea, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, effectiveBoreArea: v } }) }),
      number({ path: 'cartridge.maxPressure', label: 'field.maxPressure', kind: 'pressure', positive: true, get: (l) => l.cartridge.maxPressure, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, maxPressure: v } }) }),
      number({ path: 'cartridge.sebertFactor', label: 'field.sebertFactor', kind: 'plain', decimals: 2, get: (l) => l.cartridge.sebertFactor, set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, sebertFactor: v } }) }),
    ],
  },
  {
    title: 'group.barrel',
    fields: [
      { type: 'text', label: 'field.name', get: (l) => l.barrel.name, set: (l, v) => ({ ...l, barrel: { ...l.barrel, name: v } }) },
      number({ path: 'barrel.length', label: 'field.barrelLength', kind: 'barrelLength', positive: true, get: (l) => l.barrel.length, set: (l, v) => ({ ...l, barrel: { ...l.barrel, length: v } }) }),
      number({ path: 'barrel.twistLength', label: 'field.twistLength', kind: 'twistLength', positive: true, get: (l) => l.barrel.twistLength, set: (l, v) => ({ ...l, barrel: { ...l.barrel, twistLength: v } }) }),
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
    fields: [
      { type: 'text', label: 'field.name', get: (l) => l.projectile.name, set: (l, v) => ({ ...l, projectile: { ...l.projectile, name: v } }) },
      number({ path: 'projectile.mass', label: 'field.mass', kind: 'projectileMass', positive: true, get: (l) => l.projectile.mass, set: (l, v) => ({ ...l, projectile: { ...l.projectile, mass: v } }) }),
      number({ path: 'projectile.diameter', label: 'field.diameter', kind: 'length', positive: true, get: (l) => l.projectile.diameter, set: (l, v) => ({ ...l, projectile: { ...l.projectile, diameter: v } }) }),
      number({ path: 'projectile.length', label: 'field.length', kind: 'length', positive: true, get: (l) => l.projectile.length, set: (l, v) => ({ ...l, projectile: { ...l.projectile, length: v } }) }),
      // The seating depth isn't stored: setting it moves the overall length, as in GRT.
      number({
        path: 'cartridge.overallLength',
        label: 'field.seatingDepth',
        kind: 'length',
        get: (l) => seatingDepth(l),
        set: (l, v) => ({ ...l, cartridge: { ...l.cartridge, overallLength: l.cartridge.caseLength + l.projectile.length - v } }),
      }),
      number({ path: 'projectile.shotStartPressure', label: 'field.shotStartPressure', kind: 'pressure', positive: true, get: (l) => l.projectile.shotStartPressure, set: (l, v) => ({ ...l, projectile: { ...l.projectile, shotStartPressure: v } }) }),
    ],
  },
  {
    title: 'group.propellant',
    fields: [
      { type: 'text', label: 'field.name', get: (l) => `${l.propellant.maker} ${l.propellant.product}`.trim() },
      number({ path: 'propellant.burnModel.vivacity', label: 'field.vivacity', kind: 'plain', decimals: 4, positive: true, get: (l) => l.propellant.burnModel.vivacity, set: (l, v) => withBurnModel(l, { vivacity: v }) }),
      number({ path: 'propellant.burnModel.a0', label: 'field.a0', kind: 'plain', decimals: 4, get: (l) => l.propellant.burnModel.a0, set: (l, v) => withBurnModel(l, { a0: v }) }),
      number({ path: 'propellant.burnModel.z1', label: 'field.z1', kind: 'plain', decimals: 4, get: (l) => l.propellant.burnModel.z1, set: (l, v) => withBurnModel(l, { z1: v }) }),
      number({ path: 'propellant.burnModel.z2', label: 'field.z2', kind: 'plain', decimals: 4, get: (l) => l.propellant.burnModel.z2, set: (l, v) => withBurnModel(l, { z2: v }) }),
      number({ path: 'propellant.heatOfExplosion', label: 'field.heatOfExplosion', kind: 'specificEnergy', positive: true, get: (l) => l.propellant.heatOfExplosion, set: (l, v) => ({ ...l, propellant: { ...l.propellant, heatOfExplosion: v } }) }),
      number({ path: 'propellant.heatCapacityRatio', label: 'field.heatCapacityRatio', kind: 'plain', decimals: 4, positive: true, get: (l) => l.propellant.heatCapacityRatio, set: (l, v) => ({ ...l, propellant: { ...l.propellant, heatCapacityRatio: v } }) }),
      number({ path: 'propellant.grainDensity', label: 'field.grainDensity', kind: 'density', positive: true, get: (l) => l.propellant.grainDensity, set: (l, v) => ({ ...l, propellant: { ...l.propellant, grainDensity: v } }) }),
      number({ path: 'propellant.bulkDensity', label: 'field.bulkDensity', kind: 'density', positive: true, get: (l) => l.propellant.bulkDensity, set: (l, v) => ({ ...l, propellant: { ...l.propellant, bulkDensity: v } }) }),
    ],
  },
  {
    title: 'group.charge',
    fields: [
      number({ path: 'charge.mass', label: 'field.chargeMass', kind: 'chargeMass', positive: true, get: (l) => l.charge.mass, set: (l, v) => ({ ...l, charge: { ...l.charge, mass: v } }) }),
      number({ path: 'charge.temperature', label: 'field.temperature', kind: 'temperature', positive: true, get: (l) => l.charge.temperature, set: (l, v) => ({ ...l, charge: { ...l.charge, temperature: v } }) }),
      number({
        label: 'field.ladderSteps',
        kind: 'plain',
        decimals: 0,
        get: (l) => l.ladder?.steps ?? 1,
        set: (l, v) => withLadder(l, Math.round(v), l.ladder?.massStep ?? 0),
      }),
      number({
        label: 'field.ladderStep',
        kind: 'chargeMass',
        get: (l) => l.ladder?.massStep ?? 0,
        set: (l, v) => withLadder(l, l.ladder?.steps ?? 1, v),
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

function withBurnModel(load: Load, change: Partial<Load['propellant']['burnModel']>): Load {
  return { ...load, propellant: { ...load.propellant, burnModel: { ...load.propellant.burnModel, ...change } } };
}

/** A ladder with fewer than two charges, or no step, is no ladder. */
function withLadder(load: Load, steps: number, massStep: number): Load {
  const { ladder: _removed, ...rest } = load;
  return steps >= 2 && massStep > 0 ? { ...rest, ladder: { steps: Math.min(10, steps), massStep } } : rest;
}
