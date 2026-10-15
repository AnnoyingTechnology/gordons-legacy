import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { grtInputs, type GrtInputs } from '../src/grt-traditional/inputs.ts';
import { ResearchModel } from '../src/research/model.ts';

/**
 * The research engine against the closed forms of the published interior-ballistics theory, which hold
 * whatever the powder data: the Noble-Abel equation in a closed vessel, and the Lagrange gradient
 * between the breech, the mean and the projectile's base (Corner, *Theory of the Interior Ballistics of
 * Guns*, 1950, ch. 2 and 4; Carlucci and Jacobson, *Ballistics*, 2nd ed., ch. 5).
 *
 * They say nothing about whether the engine predicts a real shot: that needs measured pressures (#22).
 * They do say that its equation of state and its pressure gradient are the ones it claims.
 */

const FIXTURE = join(import.meta.dirname, '../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload');

function fixture(): Load {
  const result = importGrtLoad(readFileSync(FIXTURE, 'utf8'));
  if (!result.ok) throw new Error('fixture');
  return result.value;
}

/** A model whose chamber, charge and powder are round numbers, so the closed forms can be read off. */
function model(covolume: number, overrides: Partial<GrtInputs> = {}): ResearchModel {
  const inputs: GrtInputs = { ...grtInputs(fixture()), ...overrides };
  return new ResearchModel(inputs, covolume, { vivacityAveraging: false, covolume: covolume > 0 });
}

describe('the closed vessel', () => {
  it('reaches the Noble-Abel pressure f·Δ / (1 − η·Δ)', () => {
    const covolume = 0.001;
    const built = model(covolume);
    const { chargeMass, heatCapacityRatio: k } = built.inputs;
    // The force constant f = R·T_v = (k − 1)·Q, and the loading density Δ = m_c / V_b.
    const force = (k - 1) * built.heatOfExplosion;
    const density = chargeMass / built.chamber;
    const expected = (force * density) / (1 - covolume * density);
    // All burnt, nothing moving: the primer's energy is the engine's own term, taken out to compare.
    const pressure = built.pressures(1, 0, 0, 0, false).mean - ((k - 1) * built.ignitionEnergy) / built.freeVolume(1, 0);
    expect(pressure).toBeCloseTo(expected, -2);
    expect(pressure / expected).toBeCloseTo(1, 10);
  });

  it('gives the pressure a closed bomb is charged to reach', () => {
    // A bomb of 100 cm³ holding 20 g of a 1 MJ/kg powder of covolume 1 dm³/kg: Δ = 200 kg/m³, and
    // f·Δ / (1 − η·Δ) = 1e6 × 200 / 0.8 = 2,500 bar.
    const built = model(0.001, { caseCapacity: 1e-4, chargeMass: 0.02, heatOfExplosion: 1000 / (1.25 - 1), heatCapacityRatio: 1.25, seatingDepth: 0 });
    const chamber = built.chamber;
    // The chamber follows the case and the seated projectile; compare against the volume actually used.
    const density = built.inputs.chargeMass / chamber;
    const expected = ((built.inputs.heatCapacityRatio - 1) * built.heatOfExplosion * density) / (1 - 0.001 * density);
    const pressure = built.pressures(1, 0, 0, 0, false).mean - ((built.inputs.heatCapacityRatio - 1) * built.ignitionEnergy) / built.freeVolume(1, 0);
    expect(pressure).toBeCloseTo(expected, -3);
    expect(expected / 1e5).toBeGreaterThan(1000);
  });

  it('holds the solid powder before it burns and the gas covolume after', () => {
    const covolume = 0.0012;
    const built = model(covolume);
    const { chargeMass, grainDensity } = built.inputs;
    expect(built.freeVolume(0, 0)).toBeCloseTo(built.chamber - chargeMass / grainDensity, 12);
    expect(built.freeVolume(1, 0)).toBeCloseTo(built.chamber - covolume * chargeMass, 12);
    // Half burnt: half the solid is gone, half the gas is there.
    expect(built.freeVolume(0.5, 0)).toBeCloseTo(built.chamber - (0.5 * chargeMass) / grainDensity - 0.5 * covolume * chargeMass, 12);
  });

  it('ignores the covolume when it is switched off, as GRT does', () => {
    const built = new ResearchModel(grtInputs(fixture()), 0.001, { vivacityAveraging: false, covolume: false });
    expect(built.freeVolume(1, 0)).toBeCloseTo(built.chamber, 12);
  });
});

describe('the Lagrange gradient', () => {
  // Without resistance, the published ratios are p̄ = p_base (1 + m_c/3M) and p_breech = p_base (1 + m_c/2M).
  const built = model(0, { initialPressure: 0 });
  const { chargeMass } = built.inputs;
  const mass = built.effectiveMass;
  const pressures = built.pressures(0.5, 0.05, 400, 0, true);

  it('puts the mean pressure above the base pressure by m_c / 3M', () => {
    expect(pressures.mean / pressures.base).toBeCloseTo(1 + chargeMass / (3 * mass), 12);
  });

  it('puts the breech pressure above the base pressure by m_c / 2M', () => {
    expect(pressures.breech / pressures.base).toBeCloseTo(1 + chargeMass / (2 * mass), 12);
  });

  it('leaves no gradient before the projectile moves', () => {
    const atRest = built.pressures(0.2, 0, 0, 0, false);
    expect(atRest.breech).toBe(atRest.mean);
    expect(atRest.base).toBe(atRest.mean);
  });

  it('keeps the gradient when the bore resists, with the resistance at the base', () => {
    const resisting = model(0, { initialPressure: 500 }).pressures(0.5, 0.0001, 400, 0, true);
    // p_base = (p̄ + p_f·m_c/3M) / (1 + m_c/3M): the base is lifted towards the resistance it works on.
    const ratio = chargeMass / (3 * mass);
    expect(resisting.base).toBeCloseTo((resisting.mean + ratio * resisting.resistance) / (1 + ratio), 6);
    expect(resisting.resistance).toBeGreaterThan(0);
  });
});
