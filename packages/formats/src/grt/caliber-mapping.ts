import type { CaliberDefinition, CaseDimensions } from '../load/cartridge.ts';
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
