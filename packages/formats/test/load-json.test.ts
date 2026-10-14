import { describe, expect, test } from 'vitest';
import { importGrtLoad, parseLoad, serializeLoad, type ImportResult, type Load } from '../src/index.ts';
import { listFixtures, readFixture } from './fixtures.ts';

function importedLoad(path: string): Load {
  const result = importGrtLoad(readFixture(path));
  if (!result.ok) throw new Error(`Import failed: ${path}`);
  return result.value;
}

function issues(result: ImportResult<unknown>): string[] {
  return result.issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path ?? ''}`.trim());
}

/** A valid saved load, edited by `change`, as JSON text. */
function savedLoadWith(change: (document: Record<string, any>) => void): string {
  const document = JSON.parse(serializeLoad(importedLoad('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload')));
  change(document);
  return JSON.stringify(document);
}

describe('saving and reading back', () => {
  test.each(listFixtures('.grtload'))('%s is unchanged by a round trip', (path) => {
    const load = importedLoad(path);
    const result = parseLoad(serializeLoad(load));
    expect(issues(result)).toEqual([]);
    expect(result.ok && result.value).toEqual(load);
  });

  test('a powder fitted to a measured velocity keeps its fit record', () => {
    const load = importedLoad('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload');
    const fitted: Load = {
      ...load,
      propellant: {
        ...load.propellant,
        calibration: {
          targetVelocity: 400,
          achievedVelocity: 400.02,
          reached: true,
          chargeMass: 0.000388793,
          originalHeatCapacityRatio: 1.2338,
          originalVivacity: 3.2778,
          peakPressureBefore: 196.15e6,
          peakPressureAfter: 188.2e6,
          date: '2026-10-14T05:00:00.000Z',
        },
      },
    };
    const result = parseLoad(serializeLoad(fitted));
    expect(issues(result)).toEqual([]);
    expect(result.ok && result.value.propellant.calibration).toEqual(fitted.propellant.calibration);
  });

  test('saved files are indented and end with a newline', () => {
    const text = serializeLoad(importedLoad('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload'));
    expect(text.startsWith('{\n  "format": "gordons-legacy.load",\n  "schemaVersion": 1,')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });
});

describe('invalid documents', () => {
  test.each([
    ['text that is not JSON', 'not json', 'error json-syntax'],
    ['JSON that is not a load', '{"name": "x"}', 'error not-a-load'],
    ['a load from a newer version', '{"format": "gordons-legacy.load", "schemaVersion": 2}', 'error newer-version'],
  ])('%s is rejected', (_, text, issue) => {
    const result = parseLoad(text);
    expect(result.ok).toBe(false);
    expect(issues(result)).toEqual([issue]);
  });

  test('each invalid field is reported with its path', () => {
    const result = parseLoad(
      savedLoadWith((load) => {
        load.charge.mass = -0.0003;
        load.projectile.name = 42;
        delete load.barrel.length;
        load.projectile.base = { shape: 'pointed' };
        load.measurements = {};
      }),
    );
    expect(result.ok).toBe(false);
    expect(issues(result)).toEqual([
      'error missing-field barrel.length',
      'error invalid-value projectile.name',
      'error invalid-value projectile.base.shape',
      'error invalid-value charge.mass',
      'error invalid-value measurements',
    ]);
    expect(result.issues.find((issue) => issue.path === 'charge.mass')?.message).toBe(
      'Expected a number greater than 0, found -0.0003.',
    );
  });

  test('fields from a newer version are dropped with a warning', () => {
    const result = parseLoad(savedLoadWith((load) => (load.barrel.suppressor = { length: 0.2 })));
    expect(issues(result)).toEqual(['warning unknown-field barrel.suppressor']);
    expect(result.ok && 'suppressor' in result.value.barrel).toBe(false);
  });
});
