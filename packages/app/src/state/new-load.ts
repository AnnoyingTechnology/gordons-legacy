import { LOAD_FORMAT, LOAD_SCHEMA_VERSION, parseLoad, type CaliberDefinition, type Firearm, type Projectile, type Propellant } from '@gordons-legacy/formats';
import type { MessageKey } from '../i18n/i18n.ts';
import type { QuantityKind } from '../units/units.ts';

/** Required numeric inputs, in SI; the creation dialog supplies no example-load defaults. */
export interface NewLoadValues {
  /** Case capacity, m³. */
  caseCapacity: number;
  /** Case length, m. */
  caseLength: number;
  /** Cartridge overall length, m. */
  overallLength: number;
  /** Groove diameter, m. */
  grooveDiameter: number;
  /** Effective bore area, m². */
  effectiveBoreArea: number;
  /** Cartridge maximum pressure, Pa. */
  maxPressure: number;
  /** Sebert factor, dimensionless. */
  sebertFactor: number;
  /** Barrel length, m. */
  barrelLength: number;
  /** Initial pressure, Pa. */
  shotStartPressure: number;
  /** Charge mass, kg. */
  chargeMass: number;
  /** Powder temperature, K. */
  temperature: number;
}

export const NEW_LOAD_FIELDS: ReadonlyArray<{ name: keyof NewLoadValues; label: MessageKey; kind: QuantityKind | 'plain' }> = [
  { name: 'caseCapacity', label: 'field.caseCapacity', kind: 'caseCapacity' },
  { name: 'caseLength', label: 'field.caseLength', kind: 'length' },
  { name: 'overallLength', label: 'field.overallLength', kind: 'length' },
  { name: 'grooveDiameter', label: 'field.grooveDiameter', kind: 'length' },
  { name: 'effectiveBoreArea', label: 'field.effectiveBoreArea', kind: 'area' },
  { name: 'maxPressure', label: 'field.maxPressure', kind: 'pressure' },
  { name: 'sebertFactor', label: 'field.sebertFactor', kind: 'plain' },
  { name: 'barrelLength', label: 'field.barrelLength', kind: 'barrelLength' },
  { name: 'shotStartPressure', label: 'field.shotStartPressure', kind: 'pressure' },
  { name: 'chargeMass', label: 'field.chargeMass', kind: 'chargeMass' },
  { name: 'temperature', label: 'field.temperature', kind: 'temperature' },
];

/** Build and validate a new document from explicit selections and inputs, without measurements. */
export function createLoad(title: string, caliber: CaliberDefinition, projectile: Projectile, propellant: Propellant, values: Partial<NewLoadValues>, firearm?: Firearm) {
  return parseLoad(JSON.stringify({
    format: LOAD_FORMAT, schemaVersion: LOAD_SCHEMA_VERSION, title: title.trim(),
    cartridge: {
      name: caliber.name, definition: caliber, pressureMeasurementMethod: '', shotshell: false,
      caseCapacity: values.caseCapacity, caseLength: values.caseLength, overallLength: values.overallLength,
      grooveDiameter: values.grooveDiameter, effectiveBoreArea: values.effectiveBoreArea,
      maxPressure: values.maxPressure, sebertFactor: values.sebertFactor,
    },
    barrel: { gasLeaks: [], ...firearm?.barrel, name: firearm?.name ?? '', length: values.barrelLength },
    projectile: { ...projectile, shotStartPressure: values.shotStartPressure }, propellant,
    charge: { mass: values.chargeMass, temperature: values.temperature },
    measurements: [], notes: [], pictures: [],
  }));
}
