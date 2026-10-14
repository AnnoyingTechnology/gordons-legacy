import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, importGrtProjectiles, importGrtPropellant, seatingDepth, type Load } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { withProjectile, withPropellant } from '../src/editor/components.ts';

const CC0 = join(import.meta.dirname, '../../formats/test/fixtures/cc0');
const read = (path: string) => readFileSync(join(CC0, path), 'utf8');

function load(): Load {
  const result = importGrtLoad(read('loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload'));
  if (!result.ok) throw new Error('fixture');
  return result.value;
}

test('another powder keeps the charge', () => {
  const powder = importGrtPropellant(read('powders/Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant'));
  if (!powder.ok) throw new Error('fixture');
  const swapped = withPropellant(load(), powder.value);
  expect(swapped.propellant.product).toBe(powder.value.product);
  expect(swapped.charge).toEqual(load().charge);
});

test('another projectile keeps the overall length and the caliber\'s initial pressure', () => {
  const projectiles = importGrtProjectiles(read('projectiles/308_Sako_163gr_Powerhead_Blade_by_Joghurt_2022.06.27.projectile'));
  if (!projectiles.ok) throw new Error('fixture');
  const original = load();
  const swapped = withProjectile(original, projectiles.value[0]!);
  expect(swapped.projectile.mass).toBe(projectiles.value[0]!.mass);
  expect(swapped.cartridge.overallLength).toBe(original.cartridge.overallLength);
  expect(swapped.projectile.shotStartPressure).toBe(original.projectile.shotStartPressure);
  expect(seatingDepth(swapped)).toBeCloseTo(original.cartridge.caseLength + projectiles.value[0]!.length - original.cartridge.overallLength, 12);
});
