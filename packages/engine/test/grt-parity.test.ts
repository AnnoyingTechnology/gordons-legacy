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
  for (const folder of ['cc0/loads', 'maintainer']) {
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
  const simulation = grtTraditional.simulate(load);
  const unsupported = simulation.warnings.includes('unsupported-feature');

  test.skipIf(unsupported)('peak pressure, muzzle velocity and muzzle pressure match GRT', () => {
    expect(relativeError(simulation.maxPressure / 1e5, value(reference.results['MaxPressure']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.muzzleVelocity, value(reference.results['MuzzleVelocity']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.muzzlePressure / 1e5, value(reference.results['MuzzlePressure']))).toBeLessThan(SCALAR_TOLERANCE);
    expect(relativeError(simulation.barrelTime * 1000, value(reference.results['MuzzleTime']))).toBeLessThan(SCALAR_TOLERANCE);
  });

  test.skipIf(unsupported)('the whole curve matches GRT', () => {
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
