import type { Propellant } from '../load/propellant.ts';
import { optionalProperty } from '../optional-property.ts';
import { readComponentInfo } from './component-info-mapping.ts';
import type { GrtFields } from './grt-fields.ts';

/**
 * GRT's derived sorting factors (progressivity, brisance and their combination), computed from `Ba`,
 * `z1`, `k` and `Qex` with the formulas on page 46 of GRT's English manual (2021-09-29). Recomputed when
 * needed, not stored.
 */
const DERIVED_FACTORS = ['Bp', 'Br', 'Brp'];

/**
 * Maps a propellant model: the `propellant` section of a load, or a `.propellant` file. Both spell the
 * values the same way; loads add the charge and ladder, which the load importer reads and passes in
 * `ignored`.
 */
export function readPropellant(fields: GrtFields, ignored: readonly string[] = []): Propellant {
  const isComponentFile = fields.has('cdate');
  return {
    maker: fields.text('mname'),
    product: fields.text('pname'),
    lot: fields.text('lotid'),
    heatOfExplosion: fields.quantity('Qex', 'specificEnergy', 'kJ/kg'),
    heatCapacityRatio: fields.number('k'),
    covolume: fields.quantity('eta', 'specificVolume', 'cm3/g'),
    grainDensity: fields.quantity('pc', 'density', 'kg/m3'),
    bulkDensity: fields.quantity('pcd', 'density', 'kg/m3'),
    burnModel: {
      kind: 'grt',
      vivacity: fields.number('Ba'),
      a0: fields.number('a0'),
      // Only loads carry a1, and it is 0 in every file seen so far.
      a1: fields.has('a1') ? fields.number('a1') : 0,
      z1: fields.number('z1'),
      z2: fields.number('z2'),
      coldTemperatureCoefficient: fields.number('tcc'),
      hotTemperatureCoefficient: fields.number('tch'),
    },
    ...(isComponentFile ? { info: readComponentInfo(fields) } : {}),
    // Last, once every mapped value has been read.
    ...optionalProperty('unmapped', fields.unmappedValues([...DERIVED_FACTORS, ...ignored])),
  };
}
