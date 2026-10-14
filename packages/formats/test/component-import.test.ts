import { describe, expect, test } from 'vitest';
import {
  importGrtCaliber,
  importGrtProjectiles,
  importGrtPropellant,
  type ImportResult,
} from '../src/index.ts';
import { listFixtures, readFixture } from './fixtures.ts';

function expectImported<T>(result: ImportResult<T>): T {
  if (!result.ok) throw new Error(`Import failed: ${JSON.stringify(result.issues, null, 2)}`);
  return result.value;
}

describe('every fixture component file imports without errors or warnings', () => {
  test.each(listFixtures('.caliber'))('%s', (path) => {
    const result = importGrtCaliber(readFixture(path));
    expectImported(result);
    expect(result.issues).toEqual([]);
  });

  test.each(listFixtures('.projectile'))('%s', (path) => {
    const result = importGrtProjectiles(readFixture(path));
    expect(expectImported(result).length).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
  });

  test.each(listFixtures('.propellant'))('%s', (path) => {
    const result = importGrtPropellant(readFixture(path));
    expectImported(result);
    expect(result.issues).toEqual([]);
  });
});

test('a caliber file maps the standard and the cartridge outline, and keeps the rest of the drawing', () => {
  const caliber = expectImported(importGrtCaliber(readFixture('cc0/calibers/6_mm_ARC_by_Gordon_2020.09.06.caliber')));
  expect(caliber).toMatchObject({
    name: '6 mm ARC',
    alternativeNames: '6mm Advanced Rifle Cartridge, 6 ARC, 6mm ARC',
    standard: 'WildCat',
    countryOfOrigin: 'US',
    caseType: '1 rimless',
    sebertFactor: 0.5,
    info: { origin: 'cip-bobp.org', createdBy: 'GRT', createdOn: '2020-09-06' },
  });
  expect(caliber.maxPressure).toBeCloseTo(3585.27e5, 3);
  expect(caliber.caseDimensions?.caseLength).toBeCloseTo(0.03785, 12);
  expect(caliber.caseDimensions?.maximumOverallLength).toBeCloseTo(0.0574, 12);
  expect(caliber.caseDimensions?.shoulderDiameter).toBeCloseTo(0.01092, 12);
  expect(caliber.unmapped).toMatchObject({ c_alpha: '60.00' });
  expect(caliber.typicalCaseCapacity).toBeCloseTo(33.8 * 0.06479891 * 1e-6, 12);
});

test('a projectile file gives masses in grains', () => {
  const [projectile] = expectImported(
    importGrtProjectiles(readFixture('cc0/projectiles/6.5CM_Hornady_140gr_BTHP_263355_by_Barney_2022.05.28.projectile')),
  );
  expect(projectile).toMatchObject({
    name: 'Hornady, BTHP 263355',
    nominalCaliber: '.264',
    diameter: 0.00671,
    length: expect.closeTo(0.03396, 12),
    shotStartPressure: 250e5,
    ubcsCode: 'T0H1B2S4N4',
    base: { shape: 'boattail', length: 0.00386, diameterA: 0.00671, diameterB: 0.00566 },
    info: { createdBy: 'Barney', createdOn: '2022-05-28' },
  });
  expect(projectile!.mass).toBeCloseTo(139.8 * 64.79891e-6, 12);
  expect(projectile!.ballisticCoefficientG7).toBeCloseTo(0.475 * 703.0696, 3);
  expect(projectile!.unmapped).toEqual({ mode: 'userfile' });
});

test('a projectile file may hold many projectiles', () => {
  const projectiles = expectImported(
    importGrtProjectiles(readFixture('cc0/projectiles/Peregrine-2022_by_Charlie_2022.10.28.projectile')),
  );
  expect(projectiles.length).toBeGreaterThan(10);
  expect(new Set(projectiles.map((projectile) => projectile.nominalCaliber)).size).toBeGreaterThan(1);
});

test('a propellant file maps the model and leaves derived factors out', () => {
  const propellant = expectImported(
    importGrtPropellant(readFixture('cc0/powders/Accurate_MAGPRO_-_2023_06_28_by_Tom24_2023.06.22.propellant')),
  );
  expect(propellant).toMatchObject({
    maker: 'Accurate',
    product: 'MAGPRO',
    lot: '2023/06/22',
    heatOfExplosion: 3.88e6,
    heatCapacityRatio: 1.214,
    covolume: 1e-3,
    grainDensity: 1620,
    bulkDensity: 978,
    burnModel: { kind: 'grt', vivacity: 0.32, a0: 9.338100000000001, a1: 0, z1: 0.2476, z2: 0.2724 },
    info: { origin: 'GRT', createdOn: '2023-06-22' },
  });
  // Bp, Br and Brp are derived from the model and dropped; the rest is kept as written.
  expect(propellant.unmapped).toEqual({ pt: '21', Qlty: '0' });
});

test('files exported by GRT for Linux, with <svar> elements, are accepted', () => {
  const source = readFixture('cc0/projectiles/6.5CM_Hornady_140gr_BTHP_263355_by_Barney_2022.05.28.projectile')
    .replaceAll('<var ', '<svar ');
  const result = importGrtProjectiles(source);
  expect(expectImported(result)[0]!.product).toBe('BTHP 263355');
  expect(result.issues.map((issue) => issue.code)).toEqual(['svar-elements']);
});

test('a load file is not a component file', () => {
  const result = importGrtPropellant(readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload'));
  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toEqual(['not-a-grt-component']);
});
