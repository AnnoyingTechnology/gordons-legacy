import { describe, expect, test } from 'vitest';
import { importGrtLoad, seatingDepth, type ImportResult, type Load } from '../src/index.ts';
import { listFixtures, readFixture } from './fixtures.ts';

function importFixture(path: string): Load {
  return expectImported(importGrtLoad(readFixture(path), { fileName: path.split('/').pop()! }));
}

function expectImported<T>(result: ImportResult<T>): T {
  if (!result.ok) throw new Error(`Import failed: ${JSON.stringify(result.issues, null, 2)}`);
  return result.value;
}

function issueCodes(result: ImportResult<unknown>): string[] {
  return result.issues.map((issue) => `${issue.severity} ${issue.code}`);
}

describe('every fixture load', () => {
  test.each(listFixtures('.grtload'))('%s imports without errors and survives JSON', (path) => {
    const load = importFixture(path);
    expect(load.format).toBe('gordons-legacy.load');
    // The format is plain JSON: no undefined, NaN or Infinity hiding in the object.
    expect(JSON.parse(JSON.stringify(load))).toEqual(load);
    expect(Number.isFinite(load.charge.mass) && load.charge.mass > 0).toBe(true);
  });
});

describe('a .327 Federal Magnum load from the community corpus', () => {
  const path = 'cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload';
  const load = importFixture(path);

  test('converts the cartridge to SI', () => {
    expect(load.cartridge).toMatchObject({
      name: '.327 Fed Magnum',
      overallLength: 0.03683,
      caseLength: 0.030479999999999997,
      pressureMeasurementMethod: 'Piezo CIP',
      sebertFactor: 0.75,
      shotshell: false,
    });
    expect(load.cartridge.caseCapacity).toBeCloseTo(1.233657708737381e-6, 18);
    expect(load.cartridge.effectiveBoreArea).toBeCloseTo(47.935388e-6, 15);
    expect(load.cartridge.maxPressure).toBeCloseTo(3102.6407819255319e5, 3);
  });

  test('keeps the caliber definition, with the cartridge outline and the rest of the drawing', () => {
    const definition = load.cartridge.definition!;
    expect(definition.name).toBe('.327 Fed Magnum');
    expect(definition.caseType).toBe('4 pistol/revolver');
    expect(definition.specificationUrl).toBe(
      'https://bobp.cip-bobp.org/uploads/tdcc/tab-iv/tabivcal-en-page41.pdf',
    );
    expect(definition.maxPressure).toBeCloseTo(3102.64e5, 3);
    expect(definition.caseDimensions?.caseLength).toBeCloseTo(0.03048, 12);
    expect(definition.caseDimensions?.maximumOverallLength).toBeCloseTo(0.03734, 12);
    expect(definition.unmapped).toMatchObject({ beta: '35.00' });
  });

  test('converts the projectile, with the BC in kg/m²', () => {
    expect(load.projectile).toMatchObject({
      maker: 'Hornady',
      product: 'HP/XTP 32050',
      diameter: 0.00792,
      length: 0.0114,
      base: { shape: 'flat' },
      shotStartPressure: 150e5,
    });
    expect(load.projectile.mass).toBeCloseTo(5.507907349979097e-3, 15);
    // 0.145 lb/in²
    expect(load.projectile.ballisticCoefficientG1).toBeCloseTo(101.945, 3);
    expect(load.projectile.ballisticCoefficientG7).toBeUndefined();
  });

  test('derives the seating depth GRT stored', () => {
    expect(seatingDepth(load)).toBeCloseTo(5.05e-3, 9);
  });

  test('converts the propellant and keeps the burn model in GRT convention', () => {
    expect(load.propellant).toMatchObject({
      maker: 'Winchester',
      product: '231',
      heatOfExplosion: 4.0e6,
      heatCapacityRatio: 1.2214,
      covolume: 1e-3,
      burnModel: { kind: 'grt', vivacity: 3.2774, a0: 2.3163, a1: 0, z1: 0.3287, z2: 0.8307 },
    });
    expect(load.propellant.grainDensity).toBeCloseTo(1669.924455, 6);
  });

  test('separates the charge and the ladder from the powder', () => {
    expect(load.charge.mass).toBeCloseTo(0.388793459998524e-3, 15);
    expect(load.charge.temperature).toBeCloseTo(294.2611, 4); // 70 °F
    expect(load.ladder).toEqual({ steps: 8, massStep: expect.closeTo(0.1 * 64.79891e-6, 12) });
  });

  test('converts the barrel and omits values GRT leaves at 0', () => {
    expect(load.barrel).toEqual({
      name: '',
      length: 0.127,
      twistLength: expect.closeTo(0.40600122, 9),
      gasLeaks: [],
    });
  });

  test('records the origin and reports the covolume unit defect', () => {
    expect(load.importedFrom).toEqual({
      format: 'grtload',
      writerVersion: '2021.2030-NIGHTLY',
      fileName: '327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload',
    });
    expect(issueCodes(importGrtLoad(readFixture(path)))).toEqual(['info mislabelled-unit']);
  });
});

describe('maintainer loads', () => {
  test('a revolver load keeps its cylinder gap', () => {
    const load = importFixture('maintainer/TESTED_38sp_rhino_XTP_158gr_31g_A1.grtload');
    expect(load.barrel.name).toBe('Rhino 40DS 38SP');
    expect(load.barrel.gasLeaks).toEqual([
      { type: 0, name: '', description: '', position: 0.0405, width: 0.00015, height: 0 },
    ]);
  });

  test('chronograph measurements are kept in SI', () => {
    const load = importFixture('maintainer/TESTED_Ruger_300_blackout_Hornady_110gr_vmax_N110.grtload');
    const charges = load.measurements.flatMap((series) => series.charges);
    const shots = charges.flatMap((charge) => charge.shots);
    expect(shots.length).toBeGreaterThan(0);
    for (const charge of charges) expect(charge.chargeMass).toBeCloseTo(load.charge.mass, 4);
    for (const shot of shots) {
      expect(shot.velocity).toBeGreaterThan(300);
      expect(shot.pressure).toBeUndefined();
    }
  });

  test('text written by older GRT versions in Latin-1 is decoded', () => {
    // The file stores `Environ%2020%B0C`: %B0 is the degree sign in Latin-1 but invalid UTF-8.
    const load = importFixture('maintainer/TESTED_Ruger_300_blackout_Hornady_110gr_vmax_N110.grtload');
    const notes = load.measurements.flatMap((series) => series.charges.map((charge) => charge.note));
    expect(notes).toContain('Environ 20°C');
  });
});

describe('GRT boilerplate', () => {
  const pathsWithDemoData = listFixtures('.grtload').filter((path) =>
    readFixture(path).includes('EXAMPLE%20ONLY'),
  );

  test.each(pathsWithDemoData)('demonstration charges are dropped from %s', (path) => {
    const result = importGrtLoad(readFixture(path));
    const load = expectImported(result);
    const notes = load.measurements.flatMap((series) => series.charges.map((charge) => charge.note));
    expect(notes.join()).not.toContain('EXAMPLE ONLY');
    expect(issueCodes(result)).toContain('info demo-data-dropped');
  });
});

describe('invalid input', () => {
  test.each([
    ['not XML', 'just text', 'error xml-syntax'],
    ['another XML document', '<html/>', 'error not-a-grt-file'],
    ['a component file', '<GordonsReloadingTool><caliberfile/></GordonsReloadingTool>', 'error not-a-grt-load'],
  ])('%s is rejected', (_, source, code) => {
    const result = importGrtLoad(source);
    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(code);
  });

  test('a missing section and a missing value are errors with their path', () => {
    const source = readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload')
      .replace(/<gun>[\s\S]*<\/gun>/, '')
      .replace(/<input name="mc"[^>]*>/, '');
    const result = importGrtLoad(source);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing-section', path: 'gun' }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing-value', path: 'propellant/mc' }));
  });

  test('a value in an unexpected unit is an error', () => {
    const source = readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload').replace(
      'name="xe" value="127" unit="mm"',
      'name="xe" value="127" unit="bar"',
    );
    const result = importGrtLoad(source);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unexpected-unit', path: 'gun/xe' }));
  });

  test.each([
    ['a temperature below absolute zero', 'pt', '-273.16', 'invalid-value', 'charge.temperature'],
    ['a number too large to represent', 'mc', '1e309', 'invalid-number', 'propellant/mc'],
    ['a value that overflows when converted to SI', 'Qex', '1e308', 'invalid-value', 'propellant.heatOfExplosion'],
    ['a negative mass', 'mp', '-5.5', 'invalid-value', 'projectile.mass'],
  ])('%s is an error', (_, name, value, code, path) => {
    const source = readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload').replace(
      new RegExp(`(name="${name}" value=")[^"]*`),
      `$1${value}`,
    );
    const result = importGrtLoad(source);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code, path }));
  });

  test('a value GRT may add in the future is kept, not lost', () => {
    const source = readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload').replace(
      '<input name="GunName"',
      '<input name="newSetting" value="42%20units" unit="" type="string" descr="" />\n<input name="GunName"',
    );
    const load = expectImported(importGrtLoad(source));
    expect(load.unmapped).toEqual({ 'gun/newSetting': '42 units' });
  });
});

test("GRT's semi-spherical hollow base (type 3) keeps its dimensions", () => {
  const text = readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload')
    .replace('name="gTailType" value="0"', 'name="gTailType" value="3"')
    .replace('name="gtailh" value="0"', 'name="gtailh" value="2"')
    .replace('name="gTailDiaA" value="0"', 'name="gTailDiaA" value="5"');
  const result = importGrtLoad(text);
  expect(issueCodes(result)).not.toContain('unknown-code');
  expect(expectImported(result).projectile.base).toEqual({ shape: 'hollow-round', length: 0.002, diameterA: 0.005, diameterB: 0 });
});

describe('a gun section without a jump to the lands', () => {
  // GRT's own documentation ships loads whose <gun> holds only the barrel, twist and gun mass
  // (en/faq/files/30-06_*_IMR4166_*.grtload). `gjump` is written only where the user overrode it.
  const withoutJump = () =>
    readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload')
      .replace(/<input name="gjump"[^>]*\/>/, '')
      .replace(/<input name="gjumpUnlock"[^>]*\/>/, '');

  test('imports, with no jump of its own', () => {
    const load = expectImported(importGrtLoad(withoutJump()));
    expect(load.barrel.jumpToLands).toBeUndefined();
    expect(load.barrel.length).toBeGreaterThan(0);
  });

  test('is still required where the user overrode it', () => {
    const overridden = withoutJump().replace(
      '<input name="xe"',
      '<input name="gjumpUnlock" value="true" unit="" type="boolean" descr="unlocked bullet jump" />\n<input name="xe"',
    );
    const result = importGrtLoad(overridden);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'missing-value', path: 'gun/gjump' }));
  });
});
