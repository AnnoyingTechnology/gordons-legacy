import { describe, expect, test } from 'vitest';
import { importGrtLoad, parseLoad, serializeLoad, standardMaxPressures, units, type Load } from '../src/index.ts';
import { readFixture } from './fixtures.ts';

function importedLoad(path: string): Load {
  const result = importGrtLoad(readFixture(path));
  if (!result.ok) throw new Error(`Import failed: ${path}`);
  return result.value;
}

describe('standardMaxPressures', () => {
  test("takes the caliber definition's maximum under its own standard", () => {
    // The definition of this .300 AAC Blackout is CIP's, with Pmax 3,900 bar.
    const load = importedLoad('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
    expect(load.cartridge.definition?.standard).toBe('CIP');
    expect(standardMaxPressures(load.cartridge)).toEqual({ cip: 3900 * units.BAR });
  });

  test("the user's entries come first, and the other standard's value is added", () => {
    const load = importedLoad('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
    const cartridge = { ...load.cartridge, standardMaxPressures: { saami: 3792 * units.BAR } };
    expect(standardMaxPressures(cartridge)).toEqual({ cip: 3900 * units.BAR, saami: 3792 * units.BAR });
  });

  test('a cartridge without a definition or entries has none', () => {
    const load = importedLoad('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
    const { definition: _definition, ...cartridge } = load.cartridge;
    expect(standardMaxPressures(cartridge)).toEqual({});
  });

  test('entries are saved and read back', () => {
    const load = importedLoad('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
    const edited: Load = { ...load, cartridge: { ...load.cartridge, standardMaxPressures: { cip: 3900e5, saami: 3792e5 } } };
    const result = parseLoad(serializeLoad(edited));
    expect(result.ok && result.value.cartridge.standardMaxPressures).toEqual({ cip: 3900e5, saami: 3792e5 });
  });
});
