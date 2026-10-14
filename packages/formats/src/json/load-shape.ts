import type { Barrel, GasLeak } from '../load/barrel.ts';
import type { CaliberDefinition, Cartridge, CaseDimensions, ChamberDimensions, Rifling, StandardMaxPressures } from '../load/cartridge.ts';
import type { ComponentInfo } from '../load/component-info.ts';
import type { Charge, ImportOrigin, Ladder, Load, Note, Picture, ShotGroup } from '../load/load.ts';
import { LOAD_FORMAT, LOAD_SCHEMA_VERSION } from '../load/load.ts';
import type { MeasuredCharge, MeasurementSeries, Shot } from '../load/measurement.ts';
import type { Projectile, ProjectileBase } from '../load/projectile.ts';
import type { GrtBurnModel, Propellant, PropellantCalibration } from '../load/propellant.ts';
import type { FieldSpec, ShapeOf } from './shape.ts';

/*
 * The shape of each part of a load document, mirroring the types in ../load/. `satisfies ShapeOf<T>`
 * makes the compiler reject a shape that misses or adds a field.
 *
 * Quantities that can't physically be zero or negative (masses, lengths, densities) are `positive`.
 */

const optionalString = { optional: 'string' } as const;
const unmapped = { optional: 'stringRecord' } as const;

const componentInfo = {
  description: 'string',
  origin: 'string',
  createdBy: 'string',
  createdOn: 'string',
  modifiedBy: 'string',
  modifiedOn: 'string',
} satisfies ShapeOf<ComponentInfo>;

const caseDimensions = {
  caseLength: 'nonNegative',
  shoulderStart: 'nonNegative',
  neckStart: 'nonNegative',
  maximumOverallLength: 'nonNegative',
  rimDiameter: 'nonNegative',
  rimThickness: 'nonNegative',
  bodyBaseDistance: 'nonNegative',
  bodyBaseDiameter: 'nonNegative',
  shoulderDiameter: 'nonNegative',
  neckDiameter: 'nonNegative',
  mouthDiameter: 'nonNegative',
  projectileDiameter: 'nonNegative',
} satisfies ShapeOf<CaseDimensions>;

const chamberDimensions = {
  bodyBaseDistance: 'nonNegative',
  bodyBaseDiameter: 'nonNegative',
  shoulderStart: 'nonNegative',
  shoulderDiameter: 'nonNegative',
  neckStart: 'nonNegative',
  neckDiameter: 'nonNegative',
  neckEnd: 'nonNegative',
  mouthDiameter: 'nonNegative',
  throatDiameter: 'nonNegative',
} satisfies ShapeOf<ChamberDimensions>;

const rifling = {
  grooveDiameter: 'positive',
  boreDiameter: 'nonNegative',
  effectiveBoreArea: 'positive',
  grooves: 'nonNegative',
  grooveWidth: 'nonNegative',
} satisfies ShapeOf<Rifling>;

const caliberDefinition = {
  name: 'string',
  alternativeNames: 'string',
  standard: 'string',
  countryOfOrigin: 'string',
  caseType: 'string',
  standardDate: 'string',
  revisionDate: 'string',
  specificationUrl: 'string',
  maxPressure: 'nonNegative',
  sebertFactor: 'nonNegative',
  caseDimensions: { optional: { object: caseDimensions } },
  chamberDimensions: { optional: { object: chamberDimensions } },
  rifling: { optional: { object: rifling } },
  info: { object: componentInfo },
  unmapped,
} satisfies ShapeOf<CaliberDefinition>;

const standardMaxPressuresShape = {
  cip: { optional: 'positive' },
  saami: { optional: 'positive' },
} satisfies ShapeOf<StandardMaxPressures>;

const cartridge = {
  name: 'string',
  grooveDiameter: 'positive',
  effectiveBoreArea: 'positive',
  maxPressure: 'positive',
  pressureMeasurementMethod: 'string',
  standardMaxPressures: { optional: { object: standardMaxPressuresShape } },
  caseLength: 'positive',
  caseCapacity: 'positive',
  overallLength: 'positive',
  sebertFactor: 'nonNegative',
  shotshell: 'boolean',
  definition: { optional: { object: caliberDefinition } },
} satisfies ShapeOf<Cartridge>;

const gasLeak = {
  type: 'integer',
  name: 'string',
  description: 'string',
  position: 'nonNegative',
  width: 'nonNegative',
  height: 'nonNegative',
} satisfies ShapeOf<GasLeak>;

const barrel = {
  name: 'string',
  length: 'positive',
  twistLength: { optional: 'positive' },
  gunMass: { optional: 'positive' },
  jumpToLands: { optional: 'nonNegative' },
  gasLeaks: { arrayOf: { object: gasLeak } },
} satisfies ShapeOf<Barrel>;

const flatBase = { shape: { literal: 'flat' } } satisfies ShapeOf<Extract<ProjectileBase, { shape: 'flat' }>>;

function shapedBase(shape: 'hollow' | 'boattail' | 'hollow-round') {
  return {
    shape: { literal: shape },
    length: 'nonNegative',
    diameterA: 'nonNegative',
    diameterB: 'nonNegative',
  } satisfies ShapeOf<Extract<ProjectileBase, { shape: 'hollow' | 'boattail' | 'hollow-round' }>>;
}

const projectile = {
  name: 'string',
  maker: 'string',
  product: 'string',
  lot: 'string',
  nominalCaliber: optionalString,
  diameter: 'positive',
  mass: 'positive',
  length: 'positive',
  base: {
    variants: {
      field: 'shape',
      shapes: {
        flat: flatBase,
        hollow: shapedBase('hollow'),
        boattail: shapedBase('boattail'),
        'hollow-round': shapedBase('hollow-round'),
      },
    },
  },
  shotStartPressure: 'nonNegative',
  boreResistanceAdjustment: { optional: 'number' },
  ballisticCoefficientG1: { optional: 'positive' },
  ballisticCoefficientG7: { optional: 'positive' },
  ubcsCode: 'string',
  material: optionalString,
  maxSeatingDepth: { optional: 'positive' },
  info: { optional: { object: componentInfo } },
  unmapped,
} satisfies ShapeOf<Projectile>;

const grtBurnModel = {
  kind: { literal: 'grt' },
  vivacity: 'positive',
  a0: 'number',
  a1: 'number',
  z1: 'number',
  z2: 'number',
  coldTemperatureCoefficient: 'number',
  hotTemperatureCoefficient: 'number',
} satisfies ShapeOf<GrtBurnModel>;

const propellantCalibration = {
  targetVelocity: 'positive',
  achievedVelocity: 'positive',
  reached: 'boolean',
  chargeMass: 'positive',
  originalHeatCapacityRatio: 'positive',
  originalVivacity: 'positive',
  peakPressureBefore: 'positive',
  peakPressureAfter: 'positive',
  date: 'string',
} satisfies ShapeOf<PropellantCalibration>;

const propellant = {
  maker: 'string',
  product: 'string',
  lot: 'string',
  heatOfExplosion: 'positive',
  heatCapacityRatio: 'positive',
  covolume: 'nonNegative',
  grainDensity: 'positive',
  bulkDensity: 'positive',
  burnModel: { variants: { field: 'kind', shapes: { grt: grtBurnModel } } },
  calibration: { optional: { object: propellantCalibration } },
  info: { optional: { object: componentInfo } },
  unmapped,
} satisfies ShapeOf<Propellant>;

const charge = { mass: 'positive', temperature: 'positive' } satisfies ShapeOf<Charge>;

const ladder = { steps: 'integer', massStep: 'positive' } satisfies ShapeOf<Ladder>;

const shot = {
  velocity: 'positive',
  pressure: { optional: 'positive' },
  label: 'string',
  note: 'string',
} satisfies ShapeOf<Shot>;

const measuredCharge = {
  label: 'string',
  note: 'string',
  chargeMass: 'positive',
  showInReport: 'boolean',
  shots: { arrayOf: { object: shot } },
} satisfies ShapeOf<MeasuredCharge>;

const measurementSeries = {
  title: 'string',
  showInReport: 'boolean',
  charges: { arrayOf: { object: measuredCharge } },
} satisfies ShapeOf<MeasurementSeries>;

const note = {
  title: 'string',
  text: 'string',
  showInReport: 'boolean',
  isReportTemplate: 'boolean',
} satisfies ShapeOf<Note>;

const picture = {
  name: 'string',
  mediaType: 'string',
  width: 'integer',
  height: 'integer',
  data: 'string',
} satisfies ShapeOf<Picture>;

const shotGroup = {
  title: 'string',
  distance: 'positive',
  hits: { arrayOf: { object: { x: 'number', y: 'number' } } },
  picture: { optional: { object: { index: 'integer', metresPerPixel: 'positive' } } },
  note: 'string',
} satisfies ShapeOf<ShotGroup>;

const importOrigin = {
  format: 'string',
  writerVersion: optionalString,
  fileName: optionalString,
} satisfies ShapeOf<ImportOrigin>;

const load = {
  format: { literal: LOAD_FORMAT },
  schemaVersion: { literal: LOAD_SCHEMA_VERSION },
  title: 'string',
  cartridge: { object: cartridge },
  barrel: { object: barrel },
  projectile: { object: projectile },
  propellant: { object: propellant },
  charge: { object: charge },
  ladder: { optional: { object: ladder } },
  measurements: { arrayOf: { object: measurementSeries } },
  notes: { arrayOf: { object: note } },
  pictures: { arrayOf: { object: picture } },
  shotGroups: { optional: { arrayOf: { object: shotGroup } } },
  importedFrom: { optional: { object: importOrigin } },
  unmapped,
} satisfies ShapeOf<Load>;

/** The specification of a whole load document. */
export const LOAD_SPEC: FieldSpec = { object: load };

/** The specifications of the components imported on their own. */
export const CALIBER_DEFINITION_SPEC: FieldSpec = { object: caliberDefinition };
export const PROJECTILE_SPEC: FieldSpec = { object: projectile };
export const PROPELLANT_SPEC: FieldSpec = { object: propellant };
export const MEASUREMENT_SERIES_SPEC: FieldSpec = { object: measurementSeries };
