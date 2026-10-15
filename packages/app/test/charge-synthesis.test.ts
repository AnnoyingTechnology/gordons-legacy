import { readFileSync } from 'node:fs';
import { grtTraditional } from '@gordons-legacy/engine';
import { importGrtLoad, units, type Load } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { criteriaProblems, DEFAULT_CRITERIA, synthesizeCharges, type SynthesisCriteria } from '../src/analysis/charge-synthesis.ts';
import { communityComponents } from '../src/state/components.ts';

function fixture(path: string): Load {
  const result = importGrtLoad(readFileSync(new URL(`../../formats/test/fixtures/${path}`, import.meta.url), 'utf8'));
  if (!result.ok) throw new Error(path);
  return result.value;
}

const blackout = fixture('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
const special = fixture('maintainer/TESTED_38sp_rhino_XTP_158gr_31g_A1.grtload');
/** 0.001 g, the charge shown in metric. */
const resolution = 0.001 * units.GRAM;

/** Every filter, checked again on a fresh simulation of the charge as shown. */
function passes(load: Load, charge: number, criteria: SynthesisCriteria, maximum: number, propellant = load.propellant): boolean {
  const result = grtTraditional.simulate({ ...load, propellant, charge: { ...load.charge, mass: charge } });
  if (!result.ok) return false;
  const { maxPressure, muzzleVelocity } = result.simulation;
  return (
    maxPressure <= criteria.pressureShare.max * maximum &&
    maxPressure >= criteria.pressureShare.min * maximum &&
    (criteria.velocity?.max === undefined || muzzleVelocity <= criteria.velocity.max) &&
    (criteria.velocity?.min === undefined || muzzleVelocity >= criteria.velocity.min)
  );
}

describe('synthesizeCharges', () => {
  test("with the load's own powder: one match, its ends shown to 0.001 g and passing every filter when simulated again", () => {
    const { matches } = synthesizeCharges(blackout, blackout.propellant, DEFAULT_CRITERIA, resolution, grtTraditional);
    expect(matches).toHaveLength(1);
    for (const end of [matches[0]!.lowest, matches[0]!.highest]) {
      expect(Math.abs(end.charge / resolution - Math.round(end.charge / resolution))).toBeLessThan(1e-6);
      expect(passes(blackout, end.charge, DEFAULT_CRITERIA, 3900e5)).toBe(true);
      expect(end.simulation.caseFill).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(end.simulation.caseFill).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test.each([
    ['300 BLK', blackout, 3900e5],
    ['.38 Special', special, 1500e5],
  ])('%s: every community powder match passes every filter at both ends', (_name, load, maximum) => {
    for (const entry of communityComponents()) {
      if (entry.kind !== 'propellant') continue;
      const { matches } = synthesizeCharges(load, entry.value, DEFAULT_CRITERIA, resolution, grtTraditional);
      for (const match of matches) {
        expect(match.lowest.charge).toBeLessThanOrEqual(match.highest.charge);
        for (const end of [match.lowest, match.highest]) {
          expect(passes(load, end.charge, DEFAULT_CRITERIA, maximum, entry.value), entry.value.product).toBe(true);
        }
      }
    }
  });

  test('a velocity window can rule out every charge, and the samples say why', () => {
    const result = synthesizeCharges(blackout, blackout.propellant, { ...DEFAULT_CRITERIA, velocity: { max: 320 } }, resolution, grtTraditional);
    expect(result.matches).toEqual([]);
    expect(result.sampled.velocityHigh).toBeGreaterThan(0);
    expect(result.sampled.match).toBe(0);
  });

  test('a minimum velocity raises the lowest match', () => {
    const plain = synthesizeCharges(blackout, blackout.propellant, DEFAULT_CRITERIA, resolution, grtTraditional).matches[0]!;
    const middle = (plain.lowest.simulation.muzzleVelocity + plain.highest.simulation.muzzleVelocity) / 2;
    const faster = synthesizeCharges(blackout, blackout.propellant, { ...DEFAULT_CRITERIA, velocity: { min: middle } }, resolution, grtTraditional).matches[0]!;
    expect(faster.lowest.simulation.muzzleVelocity).toBeGreaterThanOrEqual(middle);
    expect(faster.lowest.charge).toBeGreaterThan(plain.lowest.charge);
  });
});

describe('criteriaProblems', () => {
  test('rejects an upside-down fill window, a non-finite share and a reversed velocity window', () => {
    expect(criteriaProblems({ ...DEFAULT_CRITERIA, fill: { min: 0.9, max: 0.8 } })).toEqual(['fill']);
    expect(criteriaProblems({ ...DEFAULT_CRITERIA, pressureShare: { min: 0.35, max: Number.NaN } })).toEqual(['pressureShare']);
    expect(criteriaProblems({ ...DEFAULT_CRITERIA, velocity: { min: 400, max: 300 } })).toEqual(['velocity']);
    expect(criteriaProblems(DEFAULT_CRITERIA)).toEqual([]);
  });

  test('invalid criteria give no match at all', () => {
    expect(synthesizeCharges(blackout, blackout.propellant, { ...DEFAULT_CRITERIA, fill: { min: 0.9, max: 0.8 } }, resolution, grtTraditional).matches).toEqual([]);
  });
});
