import { describe, expect, test } from 'vitest';
import { importGrtCaliber, importGrtLoad, units } from '../src/index.ts';
import { readFixture } from './fixtures.ts';

describe('caliber rifling and chamber', () => {
  test("the 300 BLK load's caliber definition gives the rifling GRT copied into the load (Z, Q)", () => {
    const result = importGrtLoad(readFixture('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload'));
    if (!result.ok) throw new Error('import');
    const { definition } = result.value.cartridge;
    expect(definition?.rifling?.grooveDiameter).toBeCloseTo(result.value.cartridge.grooveDiameter, 9);
    expect(definition?.rifling?.effectiveBoreArea).toBeCloseTo(result.value.cartridge.effectiveBoreArea, 9);
    expect(definition?.unmapped?.c_Z).toBeUndefined();
  });

  test('a .caliber file gives its chamber outline and rifling in SI units', () => {
    const result = importGrtCaliber(readFixture('cc0/calibers/127_x_42_50_Beowulf_by_Charlie_2023.02.11.caliber'));
    if (!result.ok) throw new Error('import');
    expect(result.value.chamberDimensions).toMatchObject({ neckEnd: 42.09 * units.MILLIMETRE, bodyBaseDiameter: 13.84 * units.MILLIMETRE });
    expect(result.value.rifling).toMatchObject({
      grooveDiameter: 12.73 * units.MILLIMETRE,
      boreDiameter: 12.43 * units.MILLIMETRE,
      effectiveBoreArea: 124.47 * units.SQUARE_MILLIMETRE,
      grooves: 6,
    });
    // Its twist (16, in inches in this file; in mm in others) stays verbatim.
    expect(result.value.unmapped?.c_u_).toBe('16.00');
  });
});

test("a caliber's V is its typical case capacity in grains of water", () => {
  const result = importGrtLoad(readFixture('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload'));
  if (!result.ok) throw new Error('import');
  // V = 24.40 gr of water: 1.581 cm³. The maintainer measured his cases at 1.513 cm³.
  expect(result.value.cartridge.definition?.typicalCaseCapacity).toBeCloseTo(24.4 * 0.06479891 * 1e-6, 12);
});
