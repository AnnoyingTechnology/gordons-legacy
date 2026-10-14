import type { Projectile, ProjectileBase } from '../load/projectile.ts';
import { optionalProperty } from '../optional-property.ts';
import { POUND_PER_SQUARE_INCH_MASS } from '../units.ts';
import { readComponentInfo } from './component-info-mapping.ts';
import type { GrtFields } from './grt-fields.ts';

/** Maps the `projectile` section of a load. Its seating depth `gdepth` is read by the load importer. */
export function readLoadProjectile(fields: GrtFields): Projectile {
  return {
    name: fields.text('ProjectileName'),
    maker: fields.text('mname'),
    product: fields.text('pname'),
    lot: fields.text('lotid'),
    diameter: fields.quantity('Dbul', 'length', 'mm'),
    mass: fields.quantity('mp', 'mass', 'g'),
    length: fields.quantity('glen', 'length', 'mm'),
    base: readBase(fields, { type: 'gTailType', length: 'gtailh', diameterA: 'gTailDiaA', diameterB: 'gTailDiaB' }),
    shotStartPressure: fields.quantity('gpressure', 'pressure', 'bar'),
    ...readSharedOptionalValues(fields),
    ubcsCode: fields.text('gUBCS'),
    // Last, once every mapped value has been read. `gfrictionUnlock` only unlocks a field in GRT's editor.
    ...optionalProperty('unmapped', fields.unmappedValues(['gfrictionUnlock', 'gdepth'])),
  };
}

/** Maps one `projectilefile` entry of a `.projectile` file. These files carry no units. */
export function readProjectileFileEntry(fields: GrtFields): Projectile {
  const maker = fields.text('mname');
  const product = fields.text('pname');
  return {
    // Component files have no display name; GRT shows the maker and product.
    name: [maker, product].filter((part) => part !== '').join(', '),
    maker,
    product,
    lot: fields.text('lotid'),
    ...optionalProperty('nominalCaliber', fields.optionalText('caliber')),
    diameter: fields.quantity('gdia', 'length', 'mm'),
    mass: fields.quantity('gmass', 'mass', 'gr'),
    length: fields.quantity('glen', 'length', 'mm'),
    base: readBase(fields, { type: 'gtailType', length: 'gtailh', diameterA: 'gtailDiaA', diameterB: 'gtailDiaB' }),
    shotStartPressure: fields.quantity('gpressure', 'pressure', 'bar'),
    ...readSharedOptionalValues(fields),
    ubcsCode: fields.text('gUBCS'),
    ...optionalProperty('material', fields.optionalText('gmaterial')),
    ...optionalProperty('maxSeatingDepth', fields.optionalQuantity('gdepthmax', 'length', 'mm')),
    info: readComponentInfo(fields),
    // Last, once every mapped value has been read.
    ...optionalProperty('unmapped', fields.unmappedValues()),
  };
}

/** Optional values spelt the same way in loads and `.projectile` files; GRT writes 0 when not given. */
function readSharedOptionalValues(fields: GrtFields): Partial<Projectile> {
  const g1 = fields.optionalNumber('g1bc');
  const g7 = fields.optionalNumber('g7bc');
  return {
    ...optionalProperty('boreResistanceAdjustment', fields.optionalQuantity('gfriction', 'pressure', 'bar')),
    ...optionalProperty('ballisticCoefficientG1', g1 === undefined ? undefined : g1 * POUND_PER_SQUARE_INCH_MASS),
    ...optionalProperty('ballisticCoefficientG7', g7 === undefined ? undefined : g7 * POUND_PER_SQUARE_INCH_MASS),
  };
}

interface BaseFieldNames {
  type: string;
  length: string;
  diameterA: string;
  diameterB: string;
}

/** GRT's base type codes 0 to 3 (its projectile-tail assistant lists them in this order). */
const BASE_SHAPES = ['flat', 'hollow', 'boattail', 'hollow-round'] as const;

function readBase(fields: GrtFields, names: BaseFieldNames): ProjectileBase {
  const code = fields.number(names.type);
  // Read all four values even for a flat base, so that none ends up in `unmapped`.
  const length = fields.quantity(names.length, 'length', 'mm');
  const diameterA = fields.quantity(names.diameterA, 'length', 'mm');
  const diameterB = fields.quantity(names.diameterB, 'length', 'mm');
  const shape = BASE_SHAPES[code];
  if (shape === undefined) {
    fields.reportUnknownCode(names.type, code, 'a flat base');
    return { shape: 'flat' };
  }
  return shape === 'flat' ? { shape } : { shape, length, diameterA, diameterB };
}
