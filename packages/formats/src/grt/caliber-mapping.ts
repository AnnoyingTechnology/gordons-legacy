import type { CaliberDefinition, CaseDimensions, ChamberDimensions, Rifling } from '../load/cartridge.ts';
import { optionalProperty } from '../optional-property.ts';
import { readComponentInfo } from './component-info-mapping.ts';
import type { GrtFields } from './grt-fields.ts';

/**
 * Maps a caliber definition: the `caliberfile` section of a load, or a `.caliber` file. These files
 * carry no units: lengths are in mm and pressures in bar.
 */
export function readCaliberDefinition(fields: GrtFields): CaliberDefinition {
  return {
    name: fields.text('cipname'),
    alternativeNames: fields.text('altname'),
    standard: fields.text('standard'),
    countryOfOrigin: fields.text('ciporigin'),
    caseType: fields.text('ciptype'),
    standardDate: fields.text('cipdate'),
    revisionDate: fields.text('ciprevdate'),
    specificationUrl: fields.text('cippdf'),
    maxPressure: fields.quantity('Pmax', 'pressure', 'bar'),
    sebertFactor: fields.number('sebert'),
    ...optionalProperty('caseDimensions', readCaseDimensions(fields)),
    ...optionalProperty('chamberDimensions', readChamberDimensions(fields)),
    ...optionalProperty('rifling', readRifling(fields)),
    info: readComponentInfo(fields),
    // Last, once every mapped value has been read. This keeps the dimensioned drawing (L1, R1, c_L3…)
    // verbatim; see CaliberDefinition.
    ...optionalProperty('unmapped', fields.unmappedValues()),
  };
}

/** The drawing's letters for each outline dimension (CIP table I). */
const CASE_DIMENSION_NAMES: Record<keyof CaseDimensions, string> = {
  caseLength: 'L3',
  shoulderStart: 'L1',
  neckStart: 'L2',
  maximumOverallLength: 'L6',
  rimDiameter: 'R1',
  rimThickness: 'R',
  bodyBaseDistance: 'E',
  bodyBaseDiameter: 'P1',
  shoulderDiameter: 'P2',
  neckDiameter: 'H1',
  mouthDiameter: 'H2',
  projectileDiameter: 'G1',
};

/** The outline, when the drawing gives at least the case length and the body diameter. */
function readCaseDimensions(fields: GrtFields): CaseDimensions | undefined {
  const entries = Object.entries(CASE_DIMENSION_NAMES).map(
    ([key, name]) => [key, fields.optionalQuantity(name, 'length', 'mm') ?? 0] as const,
  );
  const dimensions = Object.fromEntries(entries) as unknown as CaseDimensions;
  return dimensions.caseLength > 0 && dimensions.bodyBaseDiameter > 0 ? dimensions : undefined;
}

/** The drawing's letters for each chamber dimension (CIP chamber table, GRT's `c_` prefix). */
const CHAMBER_DIMENSION_NAMES: Record<keyof ChamberDimensions, string> = {
  bodyBaseDistance: 'c_E',
  bodyBaseDiameter: 'c_P1',
  shoulderStart: 'c_L1',
  shoulderDiameter: 'c_P2',
  neckStart: 'c_L2',
  neckDiameter: 'c_H1',
  neckEnd: 'c_L3',
  mouthDiameter: 'c_H2',
  throatDiameter: 'c_G1',
};

/** The chamber outline, when the drawing gives at least its length and its body diameter. */
function readChamberDimensions(fields: GrtFields): ChamberDimensions | undefined {
  // Checked first, so that a partial drawing stays in `unmapped` rather than being dropped.
  if (!fields.hasNonZero('c_L3') || !fields.hasNonZero('c_P1')) return undefined;
  const entries = Object.entries(CHAMBER_DIMENSION_NAMES).map(
    ([key, name]) => [key, fields.optionalQuantity(name, 'length', 'mm') ?? 0] as const,
  );
  const dimensions = Object.fromEntries(entries) as unknown as ChamberDimensions;
  return dimensions;
}

/**
 * The rifling (CIP chamber table: Z, F, Q, N, b), when the groove diameter and the effective area are
 * given. GRT copies Z and Q into a load's `Dz` and `Aeff` (as the maintainer's loads show). The twist u
 * isn't mapped: community files give it in inches (16) or in mm (177.8).
 */
function readRifling(fields: GrtFields): Rifling | undefined {
  if (!fields.hasNonZero('c_Z') || !fields.hasNonZero('c_Q')) return undefined;
  const length = (name: string) => fields.optionalQuantity(name, 'length', 'mm') ?? 0;
  return {
    grooveDiameter: length('c_Z'),
    boreDiameter: length('c_F'),
    effectiveBoreArea: fields.optionalQuantity('c_Q', 'area', 'mm2') ?? 0,
    grooves: fields.optionalNumber('c_N') ?? 0,
    grooveWidth: length('c_b_'),
  };
}
