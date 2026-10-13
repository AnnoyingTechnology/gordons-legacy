import type { CaliberDefinition } from '../load/cartridge.ts';
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
    info: readComponentInfo(fields),
    // Last, once every mapped value has been read. This keeps the dimensioned drawing (L1, R1, c_L3…)
    // verbatim; see CaliberDefinition.
    ...optionalProperty('unmapped', fields.unmappedValues()),
  };
}
