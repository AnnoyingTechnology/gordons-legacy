import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { grtTraditional, type SimulationProblemCode } from '../src/index.ts';

/**
 * Loads outside GRT's model must be refused, not simulated into plausible numbers, and must never hang.
 * Each case changes one value of a valid fixture (most from a review of the engine's edge cases).
 */

const FIXTURE = join(import.meta.dirname, '../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload');

function baseLoad(): Load {
  const result = importGrtLoad(readFileSync(FIXTURE, 'utf8'));
  if (!result.ok) throw new Error('fixture import failed');
  return result.value;
}

function problemsOf(change: (load: Load) => Load): Array<{ code: SimulationProblemCode; path?: string }> {
  const result = grtTraditional.simulate(change(baseLoad()));
  return result.ok ? [] : result.problems;
}

const withBurnModel = (load: Load, change: Partial<Load['propellant']['burnModel']>): Load => ({
  ...load,
  propellant: { ...load.propellant, burnModel: { ...load.propellant.burnModel, ...change } },
});

describe('input validation', () => {
  it('simulates the unchanged fixture', () => {
    expect(grtTraditional.simulate(baseLoad()).ok).toBe(true);
  });

  it.each<[string, (load: Load) => Load, SimulationProblemCode, string]>([
    ['a negative charge', (l) => ({ ...l, charge: { ...l.charge, mass: -0.001 } }), 'not-positive', 'charge.mass'],
    ['a NaN projectile mass', (l) => ({ ...l, projectile: { ...l.projectile, mass: Number.NaN } }), 'not-a-number', 'projectile.mass'],
    ['a negative grain density', (l) => ({ ...l, propellant: { ...l.propellant, grainDensity: -1669 } }), 'not-positive', 'propellant.grainDensity'],
    ['a zero bore area', (l) => ({ ...l, cartridge: { ...l.cartridge, effectiveBoreArea: 0 } }), 'not-positive', 'cartridge.effectiveBoreArea'],
    ['a NaN case capacity', (l) => ({ ...l, cartridge: { ...l.cartridge, caseCapacity: Number.NaN } }), 'not-a-number', 'cartridge.caseCapacity'],
    ['a negative twist', (l) => ({ ...l, barrel: { ...l.barrel, twistLength: -0.2 } }), 'negative', 'barrel.twistLength'],
    ['a negative Sebert factor', (l) => ({ ...l, cartridge: { ...l.cartridge, sebertFactor: -0.5 } }), 'negative', 'cartridge.sebertFactor'],
    ['k below 1', (l) => ({ ...l, propellant: { ...l.propellant, heatCapacityRatio: 0.5 } }), 'heat-capacity-ratio-too-low', 'propellant.heatCapacityRatio'],
    ['a0 making the progressive branch undefined', (l) => withBurnModel(l, { a0: -4 }), 'burn-model-undefined', 'propellant.burnModel'],
    ['a0 needing an endless zb search', (l) => withBurnModel(l, { a0: 1e-100 }), 'burn-model-undefined', 'propellant.burnModel'],
    ['z1 at zero', (l) => withBurnModel(l, { z1: 0 }), 'not-positive', 'propellant.burnModel.z1'],
    [
      'a temperature coefficient making the vivacity negative',
      (l) => ({ ...withBurnModel(l, { coldTemperatureCoefficient: -2 }), charge: { ...l.charge, temperature: 253.15 } }),
      'vivacity-not-positive',
      'charge.temperature',
    ],
    ['a charge filling the chamber exactly', (l) => ({ ...l, charge: { ...l.charge, mass: 0.0016405442731485778 } }), 'charge-exceeds-case', 'charge.mass'],
    ['a charge larger than the chamber', (l) => ({ ...l, charge: { ...l.charge, mass: 0.002 } }), 'charge-exceeds-case', 'charge.mass'],
    // 0.00145 kg of powder poured at its bulk density fills more than 120 % of this chamber but less
    // than its solid volume does.
    ['a charge compressed beyond GRT\'s 120 % fill', (l) => ({ ...l, charge: { ...l.charge, mass: 0.00145 } }), 'charge-too-compressed', 'charge.mass'],
    ['a barrel shorter than the seated projectile', (l) => ({ ...l, barrel: { ...l.barrel, length: 0.01 } }), 'barrel-too-short', 'barrel.length'],
    [
      'a gas leak of negative type',
      (l) => ({ ...l, barrel: { ...l.barrel, gasLeaks: [{ name: '', description: '', type: -1, position: 0.04, width: 0.001, height: 0.001 }] } }),
      'unknown-gas-leak',
      'barrel.gasLeaks.0.type',
    ],
    [
      'a gas leak of zero width',
      (l) => ({ ...l, barrel: { ...l.barrel, gasLeaks: [{ name: '', description: '', type: 0, position: 0.04, width: 0, height: 0 }] } }),
      'not-positive',
      'barrel.gasLeaks.0.width',
    ],
    [
      'a gas leak of a type GRT gives no area',
      (l) => ({ ...l, barrel: { ...l.barrel, gasLeaks: [{ name: '', description: '', type: 4, position: 0.04, width: 0.001, height: 0 }] } }),
      'unknown-gas-leak',
      'barrel.gasLeaks.0.type',
    ],
    [
      'a slot deeper than the bore radius',
      (l) => ({ ...l, barrel: { ...l.barrel, gasLeaks: [{ name: '', description: '', type: 3, position: 0.04, width: 0.005, height: 0.01 }] } }),
      'gas-leak-out-of-range',
      'barrel.gasLeaks.0.height',
    ],
    [
      'a square hole without a height',
      (l) => ({ ...l, barrel: { ...l.barrel, gasLeaks: [{ name: '', description: '', type: 2, position: 0.04, width: 0.004, height: 0 }] } }),
      'gas-leak-out-of-range',
      'barrel.gasLeaks.0.height',
    ],
  ])('refuses %s', (_, change, code, path) => {
    expect(problemsOf(change)).toContainEqual({ code, path });
  });

  it('refuses a twist so short that the velocity becomes undefined, rather than returning NaN', () => {
    expect(problemsOf((l) => ({ ...l, barrel: { ...l.barrel, twistLength: 1e-8 } }))).toEqual([{ code: 'numerical-failure' }]);
  });
});
