import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { researchEngine } from '../src/index.ts';
import { ResearchModel } from '../src/research/model.ts';
import { grtInputs } from '../src/grt-traditional/inputs.ts';

const FIXTURE = join(import.meta.dirname, '../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload');

function load(): Load {
  const result = importGrtLoad(readFileSync(FIXTURE, 'utf8'));
  if (!result.ok) throw new Error('fixture');
  return result.value;
}

describe('research engine R1', () => {
  it('simulates a load to the muzzle with a complete curve', () => {
    const result = researchEngine.simulate(load());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { simulation } = result;
    const model = new ResearchModel(grtInputs(load()), load().propellant.covolume);
    expect(simulation.curve.travel.at(-1)).toBeCloseTo(model.travelToMuzzle, 12);
    expect(simulation.muzzleVelocity).toBeGreaterThan(0);
    expect(simulation.maxPressure).toBeGreaterThan(simulation.muzzlePressure);
    for (const values of Object.values(simulation.curve)) expect(values.every(Number.isFinite)).toBe(true);
  });

  it('keeps energy: at the muzzle, the gas and the projectile hold what the powder and primer released', () => {
    const model = new ResearchModel(grtInputs(load()), load().propellant.covolume);
    const { chargeMass, heatCapacityRatio: k } = model.inputs;
    // With no resistance work, p̄V/(k − 1) + ½(M + m_c/3)v² = z m_c Q + E_ign by construction; check the
    // pressure function honours it at an arbitrary state.
    const z = 0.6;
    const x = 0.05;
    const v = 300;
    const p = model.pressures(z, x, v, 0, true).mean;
    const total = (p * model.freeVolume(z, x)) / (k - 1) + 0.5 * (model.effectiveMass + chargeMass / 3) * v * v;
    expect(total).toBeCloseTo(z * chargeMass * model.heatOfExplosion + model.ignitionEnergy, 6);
  });

  it('refuses what it does not model', () => {
    const jumped = { ...load(), barrel: { ...load().barrel, jumpToLands: 0.001 } };
    const result = researchEngine.simulate(jumped);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]!.code).toBe('not-modelled');
  });
});
