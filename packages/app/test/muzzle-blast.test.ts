import { readFileSync } from 'node:fs';
import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { muzzleBlast } from '../src/analysis/muzzle-blast.ts';
import { speedOfSound } from '../src/analysis/speed-of-sound.ts';

const load: Load = (() => {
  const result = importGrtLoad(
    readFileSync(new URL('../../formats/test/fixtures/maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error('fixture');
  return result.value;
})();
const shot = (() => {
  const result = grtTraditional.simulate(load);
  if (!result.ok) throw new Error('simulation');
  return result.simulation;
})();

test("reproduces Fansler's carbine shot c13p6 from its published scale lengths", () => {
  // Fansler 1998, table 2: λ/D = 39.8 and δλ = 0.437 for D = 7.62 mm, 518 m/s. By hand: λ′ = 0.447 m at
  // 90°, P/p₀ = 0.0504 at 1 m, 168.1 dB.
  const length = 39.8 * 0.00762;
  const temperature = 288.15;
  const barrel = (0.437 * length * 518) / speedOfSound(temperature);
  const carbine: Load = { ...load, barrel: { ...load.barrel, length: barrel }, charge: { ...load.charge, temperature } };
  const fake = { ...shot, muzzleVelocity: 518, muzzleGasEnergy: 101325 * length ** 3 } as Simulation;
  expect(muzzleBlast(carbine, { ...fake, muzzleVelocity: 518 })!.level).toBeCloseTo(168.1, 1);
  // Its own data point is, of course, within the data.
  const bore762 = { ...carbine, cartridge: { ...carbine.cartridge, grooveDiameter: 0.00762 } };
  expect(muzzleBlast(bore762, fake)!.extrapolated).toBe(false);
});

test('the blast is louder beside the muzzle than behind it, and falls with distance', () => {
  const side = muzzleBlast(load, shot)!.level;
  expect(muzzleBlast(load, shot, 1, Math.PI)!.level).toBeLessThan(side);
  expect(muzzleBlast(load, shot, 2)!.level).toBeLessThan(side);
});

test("the maintainer's 300 BLK full-power load: about 168 dB at 1 m beside the muzzle, an extrapolation", () => {
  // A 10.3-inch barrel: its point-source length is 38 bores, shorter than any 7.62 mm firing of the fit
  // (39.8 to 63.8), so the estimate is flagged.
  expect(muzzleBlast(load, shot)!.level).toBeCloseTo(168, 0);
  expect(muzzleBlast(load, shot)!.extrapolated).toBe(true);
});

test('no estimate without the gas energy', () => {
  const { muzzleGasEnergy: _energy, ...without } = shot;
  expect(muzzleBlast(load, without)).toBeUndefined();
});
