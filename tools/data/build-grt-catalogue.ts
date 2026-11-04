/**
 * Builds GRT's catalogue (issue #19) from the maintainer's export of GRT's database: the powders,
 * bullets and cartridges GRT itself offered, in SI units, one document per maker (per standard for
 * cartridges) in the data repository's format. Writes
 *
 *  - packages/app/src/data/grt-catalogue.json, the documents bundled with the app, which
 *    export-repository.ts also writes to the data repository;
 *  - docs/data/grt-catalogue.md, the report: what was read, what is published, and every record left
 *    out with the reason.
 *
 * Run it with Deno (or an official Node 24), giving the export's folder and, optionally, a folder of
 * `.grtload` files to check the records against the components GRT copied into those loads:
 *
 *     deno run -A tools/data/build-grt-catalogue.ts <export folder> [--loads <folder of .grtload>]
 *
 * Which records are published is decided in grt-catalogue/catalogue-selection.ts; the database's format
 * is described in docs/formats/grt-database.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ComponentDocument, GrtCatalogueKind, Provenance } from '@gordons-legacy/data';
import { importGrtDatabaseCaliber, importGrtDatabaseProjectile, importGrtDatabasePropellant, type GrtDatabaseTable } from '@gordons-legacy/formats';
import { isExcluded, selectRecord, type CatalogueEntry, type ExcludedRecord, type ExclusionReason } from './grt-catalogue/catalogue-selection.ts';
import { exportDate, readTableExport, type TableExport } from './grt-catalogue/database-export.ts';
import { crossCheckLoads, type CrossCheck, type DatabaseComponents } from './grt-catalogue/load-cross-check.ts';
import { tidyNumbers } from './tidy-numbers.ts';

const CATALOGUE = join(import.meta.dirname, '../../packages/app/src/data/grt-catalogue.json');
const REPORT = join(import.meta.dirname, '../../docs/data/grt-catalogue.md');

/** GRT's version, from its CHANGELOG.TXT: the last build, which the export was read from. */
const GRT_VERSION = 'GRT nightly 2030';

const TABLES: readonly GrtDatabaseTable[] = ['caliber', 'projectile', 'propellant'];

const KIND: Record<GrtDatabaseTable, GrtCatalogueKind> = { caliber: 'grt-calibers', projectile: 'grt-projectiles', propellant: 'grt-powders' };
const FOLDER: Record<GrtDatabaseTable, string> = { caliber: 'grt/calibers', projectile: 'grt/projectiles', propellant: 'grt/powders' };
const TITLE: Record<GrtDatabaseTable, string> = { caliber: 'GRT cartridges', projectile: 'GRT bullets', propellant: 'GRT powders' };

/** A document of the catalogue, by its path in the data repository. */
export interface CatalogueDocument {
  path: string;
  /** Display name, for the repository's index. */
  name: string;
  document: ComponentDocument;
}

/**
 * A file name from a maker's name: lower case, ASCII, dashes (`Shooters World` → `shooters-world`,
 * `Lutz Möller` → `lutz-moller`, `Berry's Bullets` → `berrys-bullets`).
 */
function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f'’]/g, '')
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'unnamed'
  );
}

/**
 * What a document groups its entries by: the maker, or the standard for cartridges. GRT spells some
 * twice (`VECTAN` and `Vectan`, `WildCat` and `Wildcat`); a group is the same file whatever the case,
 * named as most of its entries spell it.
 */
function groupName(entry: CatalogueEntry): string {
  if (entry.table === 'caliber') return entry.value.standard || 'no standard';
  return entry.value.maker || 'no maker';
}

function provenance(table: GrtDatabaseTable, read: string): Provenance {
  return {
    origin: "Gordon's Reloading Tool's own database (issue #19)",
    source: `GordonsReloadingTool.db of ${GRT_VERSION}, table ${table}, read from a running GRT on ${read}`,
    file: 'GordonsReloadingTool.db',
    author: 'GRT',
    date: read,
    method: "GRT's own rows that GRT neither deleted nor hid, converted to SI (tools/data/build-grt-catalogue.ts, docs/data/grt-catalogue.md)",
    status: 'unverified',
  };
}

/** The catalogue's documents: one per table and group, entries in GRT's row order. */
export function catalogueDocuments(entries: readonly CatalogueEntry[], read: string): CatalogueDocument[] {
  const groups = new Map<string, { table: GrtDatabaseTable; spellings: Map<string, number>; entries: CatalogueEntry[] }>();
  for (const entry of entries) {
    const name = groupName(entry);
    const key = `${entry.table} ${slug(name)}`;
    const group = groups.get(key) ?? { table: entry.table, spellings: new Map<string, number>(), entries: [] };
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ table, spellings, entries: grouped }) => {
      const name = [...spellings].sort((a, b) => b[1] - a[1])[0]![0];
      const value = tidyNumbers(grouped.map((entry) => entry.value), 12);
      return {
        path: `${FOLDER[table]}/${slug(name)}.json`,
        name: `${TITLE[table]}: ${name}`,
        document: { format: 'gordons-legacy.component', version: 1, kind: KIND[table], provenance: provenance(table, read), value } as ComponentDocument,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Every record GRT made and did not delete, hidden powder models included, for the cross-check. */
function grtRecords(tables: readonly TableExport[]): DatabaseComponents {
  const own = (table: GrtDatabaseTable) => tables.find((read) => read.table === table)!.records.filter((record) => record['cby'] === 'GRT' && record['geloescht'] === 0);
  const values = <T>(results: Array<{ ok: true; value: T } | { ok: false }>) => results.flatMap((result) => (result.ok ? [result.value] : []));
  return {
    calibers: values(own('caliber').map(importGrtDatabaseCaliber)),
    projectiles: values(own('projectile').map(importGrtDatabaseProjectile)),
    propellants: values(own('propellant').map(importGrtDatabasePropellant)),
  };
}

const REASONS: readonly ExclusionReason[] = ['deleted', 'made by a user', 'hidden by GRT', 'rejected by the importer'];

function report(read: string, tables: readonly TableExport[], published: readonly CatalogueEntry[], excluded: readonly ExcludedRecord[], documents: readonly CatalogueDocument[], checks: readonly CrossCheck[] | undefined): string {
  const lines = [
    '# GRT catalogue: what was read and what is published',
    '',
    `Generated by \`tools/data/build-grt-catalogue.ts\` from the export of GRT's database read on ${read}`,
    `(${GRT_VERSION}); do not edit by hand. The format and the reading are described in`,
    '[docs/formats/grt-database.md](../formats/grt-database.md), the rules in',
    '`tools/data/grt-catalogue/catalogue-selection.ts`. These are simulator inputs, not load data: use the',
    "makers' published load data.",
    '',
    `| Table | Rows read | Unreadable | Row ids missing | Published | ${REASONS.map((reason) => reason[0]!.toUpperCase() + reason.slice(1)).join(' | ')} |`,
    `|---|---:|---:|---:|---:|${REASONS.map(() => '---:').join('|')}|`,
  ];
  for (const table of tables) {
    const count = (reason: ExclusionReason) => excluded.filter((record) => record.table === table.table && record.reason === reason).length;
    const rows = table.records.length + table.unreadableRows.length;
    const kept = published.filter((entry) => entry.table === table.table).length;
    lines.push(`| ${table.table} | ${rows} | ${table.unreadableRows.length} | ${table.missingRowIds.length} | ${kept} | ${REASONS.map(count).join(' | ')} |`);
  }
  lines.push('', `${documents.length} documents (one per maker, per standard for cartridges).`, '');
  lines.push('## Row ids missing', '');
  lines.push('A row id below the highest that no row has. For the propellant table, the B-tree GRT had in memory has no');
  lines.push('cell for any of them: they were not in the table, most likely deleted. The projectile gaps could not be');
  lines.push('checked. See docs/formats/grt-database.md.', '');
  for (const table of tables) lines.push(`- ${table.table}: ${table.missingRowIds.length === 0 ? 'none' : table.missingRowIds.join(', ')}`);
  for (const table of tables) {
    if (table.unreadableRows.length > 0) lines.push(`- ${table.table}, unreadable rows: ${table.unreadableRows.join(', ')}`);
  }
  lines.push('', '## Records left out', '');
  for (const reason of REASONS) {
    const records = excluded.filter((record) => record.reason === reason);
    lines.push(`### ${reason[0]!.toUpperCase()}${reason.slice(1)} (${records.length})`, '');
    if (records.length === 0) lines.push('None.');
    for (const record of records) {
      const issues = record.issues.map((issue) => ` — ${issue.severity} ${issue.code} at ${issue.path ?? '?'}: ${issue.message}`).join('');
      lines.push(`- ${record.table} row ${record.row}: ${record.name}${issues}`);
    }
    lines.push('');
  }
  if (checks !== undefined) {
    lines.push('## Cross-check against loads', '');
    lines.push("Each component a folder of the maintainer's `.grtload` files uses, against the database's record of the");
    lines.push('same name (hidden powder models included). Powders: every burn-model and thermochemical value; bullets:');
    lines.push('mass and shot-start pressure; cartridges: maximum pressure, case capacity, Sebert factor, case length,');
    lines.push('maximum overall length, groove diameter and bore area. A difference is either an extraction error or a');
    lines.push('value the user changed in the load (a velocity fit, a weighed bullet); the values say which.', '');
    for (const kind of ['powder', 'bullet', 'cartridge'] as const) {
      const ofKind = checks.filter((check) => check.kind === kind);
      const allSame = ofKind.filter((check) => check.sameLoads === check.loads).length;
      lines.push(`- ${kind}s: ${ofKind.length} compared, ${allSame} the same in every load that uses them`);
      for (const check of ofKind.filter((check) => check.sameLoads !== check.loads)) {
        if (!check.found) {
          lines.push(`  - ${check.name} (${check.loads} loads): no record of GRT's of that name`);
          continue;
        }
        const variants = [...new Set(check.differences.map((values) => values.join('; ')))];
        lines.push(`  - ${check.name}: the same in ${check.sameLoads} of ${check.loads} loads; the others: ${variants.join(' | ')}`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function commandLine(argv: readonly string[]): { folder: string; loads: string | undefined } {
  const plain: string[] = [];
  let loads: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--loads') loads = argv[++index] ?? '';
    else plain.push(argv[index]!);
  }
  if (plain[0] === undefined || loads === '') throw new Error('usage: build-grt-catalogue.ts <export folder> [--loads <folder of .grtload>]');
  return { folder: plain[0], loads };
}

function main(): void {
  const { folder, loads } = commandLine(process.argv.slice(2));
  const read = exportDate(folder);
  const tables = TABLES.map((table) => readTableExport(folder, table));
  const selections = tables.flatMap((table) => table.records.map((record) => selectRecord(table.table, record)));
  const excluded = selections.filter(isExcluded);
  const published = selections.filter((selection): selection is CatalogueEntry => !isExcluded(selection));
  const documents = catalogueDocuments(published, read);
  const checks = loads === undefined ? undefined : crossCheckLoads(loads, grtRecords(tables));
  writeFileSync(CATALOGUE, `${JSON.stringify(documents)}\n`);
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report(read, tables, published, excluded, documents, checks));
  console.log(`${published.length} published in ${documents.length} documents, ${excluded.length} left out → ${CATALOGUE}, ${REPORT}`);
}

/** Only when this file is the program, so that a test can import the rules above (as export-repository.ts). */
if (import.meta.main ?? (process.argv[1] ?? '').endsWith('build-grt-catalogue.ts')) main();
