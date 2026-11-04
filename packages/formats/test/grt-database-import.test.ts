import { expect, test } from 'vitest';
import {
  grtDatabaseRecord,
  importGrtDatabaseCaliber,
  importGrtDatabaseProjectile,
  importGrtDatabasePropellant,
  importGrtLoad,
  type GrtDatabaseRecord,
  type GrtDatabaseTable,
  type GrtDatabaseValue,
  type ImportResult,
  type Load,
} from '../src/index.ts';
import { readFixture } from './fixtures.ts';

/*
 * Records of GRT's own database (fixtures/grt-database/, as the maintainer's export of 2026-11-04 holds
 * them), checked against what GRT itself copied into the maintainer's loads made with them.
 */

function records(table: GrtDatabaseTable): GrtDatabaseRecord[] {
  const rows = JSON.parse(readFixture(`grt-database/${table}.json`)) as Array<{ rowid: number; cols: GrtDatabaseValue[] }>;
  return rows.map((row) => grtDatabaseRecord(table, row.rowid, row.cols)!);
}

function record(table: GrtDatabaseTable, row: number): GrtDatabaseRecord {
  return records(table).find((candidate) => candidate['id'] === row)!;
}

function imported<T>(result: ImportResult<T>): T {
  if (!result.ok) throw new Error(`Import failed: ${JSON.stringify(result.issues, null, 2)}`);
  expect(result.issues).toEqual([]);
  return result.value;
}

function maintainerLoad(file: string): Load {
  const result = importGrtLoad(readFixture(`maintainer/${file}`));
  if (!result.ok) throw new Error('fixture');
  return result.value;
}

test('a record is read by its column names, the row id filling in the id SQLite stores as NULL', () => {
  const values = JSON.parse(readFixture('grt-database/propellant.json'))[0].cols as GrtDatabaseValue[];
  expect(values[0]).toBeNull();
  const powder = grtDatabaseRecord('propellant', 5, values)!;
  expect(powder).toMatchObject({ id: 5, mname: 'Accurate', pname: '2460', lotid: '2020-08-11', Ba: 0.5309, geloescht: 0 });
  // A record of another length was read from another schema, or read wrongly.
  expect(grtDatabaseRecord('propellant', 5, values.slice(1))).toBeUndefined();
});

test("a powder model of the database is the one GRT copied into the maintainer's loads", () => {
  const loads = [
    ['TESTED_Ruger_300_blackout_Hornady_110gr_vmax_N110.grtload', 536],
    ['glock17_eng5_n340_115grain_xtp_PLUS-P.grtload', 589],
    ['TESTED_38sp_rhino_XTP_158gr_31g_A1.grtload', 490],
  ] as const;
  for (const [file, row] of loads) {
    const { info: _info, unmapped: _unmapped, ...fromDatabase } = imported(importGrtDatabasePropellant(record('propellant', row)));
    const { info: _loadInfo, unmapped: _loadUnmapped, ...fromLoad } = maintainerLoad(file).propellant;
    expect(fromDatabase, file).toEqual(fromLoad);
  }
});

test('a powder keeps its model quality and calibration values, not the database bookkeeping', () => {
  const powder = imported(importGrtDatabasePropellant(record('propellant', 6)));
  expect(powder).toMatchObject({ maker: 'Accurate', product: '2460', lot: '2019-12-19' });
  expect(powder.covolume).toBeCloseTo(0.001, 12); // 1 cm³/g
  expect(powder.unmapped).toMatchObject({ Qlty: '0.75', pt: '21' });
  // `mode` is `hidden` on this row: the catalogue decides on it (tools/data/grt-catalogue/), the
  // component does not carry it.
  expect(powder.unmapped).not.toHaveProperty('mode');
  expect(powder.unmapped).not.toHaveProperty('geloescht');
  expect(powder.unmapped).not.toHaveProperty('imageUuid');
});

test("a bullet of the database is the one GRT copied into the maintainer's load", () => {
  const vmax = imported(importGrtDatabaseProjectile(record('projectile', 2394)));
  const load = maintainerLoad('300_blackout_Hornady_110gr_vmax_full_patate.grtload').projectile;
  expect(vmax).toMatchObject({ name: 'Hornady, V-MAX 23010', nominalCaliber: '.308', base: load.base });
  // The load keeps the mass in grams as GRT rounded it (7.127880099973 g); the database, 110 gr.
  expect(vmax.mass).toBeCloseTo(load.mass, 12);
  expect(vmax.shotStartPressure).toBe(load.shotStartPressure);
  expect(vmax.unmapped).toBeUndefined();
});

test('a bullet reads its base from the columns the projectile table spells its own way', () => {
  const amax = imported(importGrtDatabaseProjectile(record('projectile', 1990)));
  // gtailtype 2, gtaildiaA 5.7, gtaildiaB 5.1, gtailh 1.5 (mm); `.projectile` files spell them gtailType…
  expect(amax.base).toEqual({ shape: 'boattail', length: expect.closeTo(0.0015, 12), diameterA: expect.closeTo(0.0057, 12), diameterB: expect.closeTo(0.0051, 12) });
  expect(amax.mass).toBeCloseTo(52 * 0.06479891e-3, 15);
  expect(amax.ballisticCoefficientG1).toBeCloseTo(0.247 * 703.0695796, 6); // lb/in² to kg/m²
  expect(amax.unmapped).toBeUndefined();
});

test("a cartridge of the database is the definition GRT copied into the maintainer's load", () => {
  const blackout = imported(importGrtDatabaseCaliber(record('caliber', 100)));
  const definition = maintainerLoad('300_blackout_Hornady_110gr_vmax_full_patate.grtload').cartridge.definition!;
  expect(blackout.name).toBe('.300 AAC Blackout');
  expect(blackout.maxPressure).toBe(definition.maxPressure);
  expect(blackout.caseDimensions).toEqual(definition.caseDimensions);
  expect(blackout.chamberDimensions).toEqual(definition.chamberDimensions);
  expect(blackout.rifling).toEqual(definition.rifling);
  expect(blackout.sebertFactor).toBe(definition.sebertFactor);
});

test('a value the specification rejects fails the import, with the row in the path', () => {
  const broken = { ...record('projectile', 2222), gmass: -115 };
  const result = importGrtDatabaseProjectile(broken);
  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.path)).toContain('mass');
  const unreadable = importGrtDatabaseProjectile({ ...record('projectile', 2222), gdia: 'wide' });
  expect(unreadable.issues).toContainEqual(expect.objectContaining({ code: 'invalid-number', path: 'projectile[2222]/gdia' }));
});

test('a text GRT stored with JSON-style escapes is decoded, and the import says so', () => {
  const result = importGrtDatabaseCaliber(record('caliber', 105));
  expect(result.ok && result.value.name).toBe(".300 HAM'R");
  expect(result.issues).toEqual([{ severity: 'info', code: 'escaped-text', message: expect.any(String), path: 'caliber[105]/cipname' }]);
});
