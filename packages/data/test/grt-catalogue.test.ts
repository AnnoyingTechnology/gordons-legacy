import { readFileSync } from 'node:fs';
import { grtDatabaseRecord, type GrtDatabaseRecord, type GrtDatabaseTable, type GrtDatabaseValue } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { catalogueDocuments } from '../../../tools/data/build-grt-catalogue.ts';
import { isExcluded, selectRecord, type CatalogueEntry } from '../../../tools/data/grt-catalogue/catalogue-selection.ts';
import { readTableExport } from '../../../tools/data/grt-catalogue/database-export.ts';
import { readDocument, sha256, validateRepository } from '../src/index.ts';

/*
 * GRT's catalogue (tools/data/build-grt-catalogue.ts, issue #19): which records of GRT's database are
 * published, and the documents they are published in. The records are real rows of GRT's database
 * (packages/formats/test/fixtures/grt-database/).
 */

const FIXTURES = new URL('../../formats/test/fixtures/grt-database/', import.meta.url);

function records(table: GrtDatabaseTable): GrtDatabaseRecord[] {
  const rows = JSON.parse(readFileSync(new URL(`${table}.json`, FIXTURES), 'utf8')) as Array<{ rowid: number; cols: GrtDatabaseValue[] }>;
  return rows.map((row) => grtDatabaseRecord(table, row.rowid, row.cols)!);
}

function row(table: GrtDatabaseTable, id: number): GrtDatabaseRecord {
  return records(table).find((record) => record['id'] === id)!;
}

describe('which records of GRT database are published', () => {
  it("publishes GRT's own powder model and leaves out the earlier one GRT hid", () => {
    const current = selectRecord('propellant', row('propellant', 5));
    expect(isExcluded(current)).toBe(false);
    expect(current).toMatchObject({ table: 'propellant', row: 5, value: { maker: 'Accurate', product: '2460', lot: '2020-08-11' } });
    expect(selectRecord('propellant', row('propellant', 6))).toMatchObject({ reason: 'hidden by GRT', name: 'Accurate 2460 2019-12-19' });
  });

  it("leaves out an entry a user of the maintainer's copy made, and one GRT deleted", () => {
    expect(selectRecord('projectile', row('projectile', 5651))).toMatchObject({ reason: 'made by a user', name: 'H&N RN HS max.1600fps Copy1' });
    expect(selectRecord('caliber', { ...row('caliber', 100), geloescht: 1 })).toMatchObject({ reason: 'deleted', name: '.300 AAC Blackout' });
  });

  it('leaves out a record the importer had to warn about, with the issues', () => {
    const selection = selectRecord('projectile', { ...row('projectile', 1990), gtailtype: 7 });
    expect(selection).toMatchObject({ reason: 'rejected by the importer' });
    expect(isExcluded(selection) && selection.issues).toContainEqual(expect.objectContaining({ code: 'unknown-code' }));
  });

  it('reads an export folder and reports the row ids no row has', () => {
    const powders = readTableExport(FIXTURES.pathname, 'propellant');
    expect(powders.records.map((record) => record['id'])).toEqual([5, 6, 490, 536, 589]);
    expect(powders.unreadableRows).toEqual([]);
    expect(powders.missingRowIds).toHaveLength(589 - 5);
    expect(powders.missingRowIds.slice(0, 5)).toEqual([1, 2, 3, 4, 7]);
  });
});

describe("the catalogue's documents", () => {
  const published = (['caliber', 'projectile', 'propellant'] as const)
    .flatMap((table) => records(table).map((record) => selectRecord(table, record)))
    .filter((selection): selection is CatalogueEntry => !isExcluded(selection));
  const documents = catalogueDocuments(published, '2026-11-04');

  it('are one per maker, per standard for cartridges', () => {
    expect(documents.map(({ path, name }) => [path, name])).toEqual([
      ['grt/calibers/cip.json', 'GRT cartridges: CIP'],
      ['grt/calibers/saami.json', 'GRT cartridges: SAAMI'],
      ['grt/powders/accurate.json', 'GRT powders: Accurate'],
      ['grt/powders/vectan.json', 'GRT powders: Vectan'],
      ['grt/powders/vihtavuori.json', 'GRT powders: Vihtavuori'],
      ['grt/projectiles/hornady.json', 'GRT bullets: Hornady'],
    ]);
    const vihtavuori = documents.find((document) => document.path === 'grt/powders/vihtavuori.json')!.document;
    expect(vihtavuori.kind).toBe('grt-powders');
    expect(vihtavuori.kind === 'grt-powders' && vihtavuori.value.map((powder) => powder.product)).toEqual(['N110', 'N340']);
    expect(vihtavuori.provenance).toMatchObject({ file: 'GordonsReloadingTool.db', author: 'GRT', date: '2026-11-04', status: 'unverified' });
  });

  it('read back as the repository reads a download, and pass its checks', async () => {
    const files = new Map(documents.map(({ path, document }) => [path, `${JSON.stringify(document, null, 2)}\n`]));
    for (const [path, text] of files) expect(readDocument(text), path).toBeDefined();
    const entries = await Promise.all(documents.map(async ({ path, name, document }) => ({ path, name, kind: document.kind, sha256: await sha256(files.get(path)!) })));
    expect(await validateRepository({ format: 'gordons-legacy.data-index', version: 1, files: entries }, files)).toEqual([]);
  });

  it('are taken whole or not at all: one bad entry costs its document', () => {
    const hornady = documents.find((document) => document.path === 'grt/projectiles/hornady.json')!.document;
    if (hornady.kind !== 'grt-projectiles') throw new Error('fixture');
    const broken = { ...hornady, value: [...hornady.value, { ...hornady.value[0]!, mass: -1 }] };
    expect(readDocument(JSON.stringify(broken))).toBeUndefined();
  });
});
