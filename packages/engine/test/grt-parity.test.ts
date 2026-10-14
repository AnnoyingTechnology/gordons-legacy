import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { grtTraditional } from '../src/index.ts';

/**
 * Compares the GRT Traditional engine with results captured from GRT itself
 * (test/reference/grt, tools/grt-capture). These are simulation outputs, not load data.
 */

const REFERENCES = join(import.meta.dirname, 'reference/grt');
const FIXTURES = join(import.meta.dirname, '../../formats/test/fixtures');

interface Reference {
  source: string;
  results: Record<string, string>;
  curve: { position_mm: number[]; pressure_bar: number[]; velocity_m_s: number[]; burntFraction: number[]; time_ms: number[] };
}

/** GRT writes results as "value unit"; returns the value. */
function value(text: string | undefined): number {
  return Number.parseFloat(text ?? 'NaN');
}

function fixtureLoad(source: string): Load {
  for (const folder of ['cc0/loads', 'maintainer', 'variants']) {
    try {
      const result = importGrtLoad(readFileSync(join(FIXTURES, folder, source), 'utf8'));
      if (result.ok) return result.value;
    } catch {
      // not in this folder
    }
  }
  throw new Error(`fixture ${source} not found`);
}

const references: Reference[] = readdirSync(REFERENCES)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(REFERENCES, name), 'utf8')) as Reference);

/** Scalars are captured at full precision; the engine matches them to the last bits of a double. */
const SCALAR_TOLERANCE = 1e-12;
/** The references store curves to 10 significant digits. */
const CURVE_TOLERANCE = 1e-9;

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12);
}

describe.each(references.map((reference) => [reference.source, reference] as const))('%s', (_, reference) => {
  const load = fixtureLoad(reference.source);
  const result = grtTraditional.simulate(load);
  if (!result.ok) throw new Error(`${reference.source}: ${JSON.stringify(result.problems)}`);
  const { simulation } = result;

  test('peak pressure, muzzle velocity and muzzle pressure match GRT', () => {
    expect(relativeError(simulation.maxPressure / 1e5, value(reference.results['MaxPressure']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.muzzleVelocity, value(reference.results['MuzzleVelocity']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.muzzlePressure / 1e5, value(reference.results['MuzzlePressure']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.barrelTime * 1000, value(reference.results['MuzzleTime']))).toBeLessThan(SCALAR_TOLERANCE);
  });

  test('derived results match GRT', () => {
    const { results } = reference;
    expect(relativeError(simulation.muzzleEnergy, value(results['MuzzleEnergy']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.efficiency, value(results['Efficiency']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError((simulation.muzzleSpinRate ?? 0) * 60, value(results['MuzzleRPM']))).toBeLessThan(SCALAR_TOLERANCE);
    // GRT reports recoil rounded for display: 2 decimals, 3 for the force in kN.
    const { recoil } = simulation;
    expect(recoil.projectileImpulse).toBeCloseTo(value(results['RecoilImpulseProjectile']), 2);
    expect(recoil.chargeImpulse).toBeCloseTo(value(results['RecoilImpulsePropellant']), 2);
    expect(recoil.totalImpulse).toBeCloseTo(value(results['RecoilImpulse']), 2);
    expect(recoil.gun?.energy ?? 0).toBeCloseTo(value(results['RecoilEnergy']), 2);
    expect(recoil.gun?.velocity ?? 0).toBeCloseTo(value(results['RecoilVelocity']), 2);
    expect(recoil.gun?.acceleration ?? 0).toBeCloseTo(value(results['RecoilAcceleration']), 2);
    expect((recoil.gun?.force ?? 0) / 1000).toBeCloseTo(value(results['RecoilForce']), 3);
    if (results['OptimalBarrelTime'] === '') {
      expect(simulation.optimalBarrelTime).toBeUndefined();
    } else {
      const obt = simulation.optimalBarrelTime!;
      expect(relativeError(obt.time * 1000, value(results['OptimalBarrelTime']))).toBeLessThan(SCALAR_TOLERANCE);
      expect(`#${Math.trunc(obt.node)}${obt.node % 1 !== 0 ? ' ½' : ''}`).toBe(results['OptimalBarrelTimeNode']);
    }
    // GRT leaves the lead time empty, and the 10 % time at 0, when the initial pressure is above 10 % of the peak.
    if (results['BulletLeadTime10Pmax'] === '') {
      expect(simulation.leadTime).toBeUndefined();
      expect(value(results['Pmax10Time'])).toBe(0);
    } else {
      expect(relativeError(simulation.tenPercentPeakTime! * 1000, value(results['Pmax10Time']))).toBeLessThan(SCALAR_TOLERANCE);
      expect(relativeError(simulation.leadTime! * 1000, value(results['BulletLeadTime10Pmax']))).toBeLessThan(SCALAR_TOLERANCE);
    }
  });

  test('the whole curve matches GRT', () => {
    const { curve } = reference;
    expect(simulation.curve.pressure.length).toBe(curve.pressure_bar.length);
    let worst = 0;
    for (let index = 0; index < curve.pressure_bar.length; index++) {
      worst = Math.max(
        worst,
        relativeError(simulation.curve.pressure[index]! / 1e5, curve.pressure_bar[index]!),
        index > 0 ? relativeError(simulation.curve.velocity[index]!, curve.velocity_m_s[index]!) : 0,
        Math.abs(simulation.curve.burntFraction[index]! - curve.burntFraction[index]!),
        index > 1 ? relativeError(simulation.curve.time[index]! * 1000, curve.time_ms[index]!) : 0,
      );
    }
    expect(worst).toBeLessThan(CURVE_TOLERANCE);
  });
});
