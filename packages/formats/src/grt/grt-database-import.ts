import { IssueLog, type ImportResult } from '../import-issues.ts';
import { CALIBER_DEFINITION_SPEC, PROJECTILE_SPEC, PROPELLANT_SPEC } from '../json/load-shape.ts';
import { checkValue } from '../json/shape.ts';
import type { CaliberDefinition } from '../load/cartridge.ts';
import type { Projectile } from '../load/projectile.ts';
import type { Propellant } from '../load/propellant.ts';
import { readCaliberDefinition } from './caliber-mapping.ts';
import type { GrtDatabaseRecord, GrtDatabaseTable } from './grt-database-tables.ts';
import { GrtFields } from './grt-fields.ts';
import { readProjectileFileEntry } from './projectile-mapping.ts';
import { readPropellant } from './propellant-mapping.ts';

/*
 * Imports the records of GRT's database (docs/formats/grt-database.md). A record holds the values of
 * the matching component file under the same names and in the same units, so each goes through the
 * component file's mapping and is checked against the same specification as a saved load.
 */

/**
 * Columns of the database's own bookkeeping, which no component file has: the row id, the deletion
 * flag (`geloescht`, German for "deleted"), GRT's display state (`type`, `mode`, `status`; `mode` is
 * `hidden` on the powder models GRT no longer offers) and references into the `image` table. Whoever
 * reads the database decides on the flags (tools/data/build-grt-catalogue.ts); a component doesn't
 * carry them.
 */
const BOOKKEEPING_COLUMNS = new Set(['id', 'geloescht', 'type', 'mode', 'status', 'imageUuid', 'imageDetailUuid']);

/** The projectile table's spellings of the base's values, as `.projectile` files spell them. */
const PROJECTILE_COLUMN_NAMES: Readonly<Record<string, string>> = {
  gtailtype: 'gtailType',
  gtaildiaA: 'gtailDiaA',
  gtaildiaB: 'gtailDiaB',
};

/** Imports a record of the `caliber` table. */
export function importGrtDatabaseCaliber(record: GrtDatabaseRecord): ImportResult<CaliberDefinition> {
  const log = new IssueLog();
  const caliber = readCaliberDefinition(recordFields(record, 'caliber', log));
  checkValue(caliber, CALIBER_DEFINITION_SPEC, '', log);
  return log.result(caliber);
}

/** Imports a record of the `projectile` table. */
export function importGrtDatabaseProjectile(record: GrtDatabaseRecord): ImportResult<Projectile> {
  const log = new IssueLog();
  const projectile = readProjectileFileEntry(recordFields(record, 'projectile', log, PROJECTILE_COLUMN_NAMES));
  checkValue(projectile, PROJECTILE_SPEC, '', log);
  return log.result(projectile);
}

/** Imports a record of the `propellant` table. */
export function importGrtDatabasePropellant(record: GrtDatabaseRecord): ImportResult<Propellant> {
  const log = new IssueLog();
  const propellant = readPropellant(recordFields(record, 'propellant', log));
  checkValue(propellant, PROPELLANT_SPEC, '', log);
  return log.result(propellant);
}

/**
 * A record's values as a component file's, by the file's names. Numbers become the text GRT would
 * write (JavaScript's shortest exact form); NULL, which these tables never hold outside `id`, becomes
 * empty, which the mappings read as "not given".
 */
function recordFields(
  record: GrtDatabaseRecord,
  table: GrtDatabaseTable,
  log: IssueLog,
  names: Readonly<Record<string, string>> = {},
): GrtFields {
  const section = `${table}[${String(record['id'])}]`;
  const columns = Object.entries(record)
    .filter(([column]) => !BOOKKEEPING_COLUMNS.has(column))
    .map(([column, value]) => {
      const name = names[column] ?? column;
      return [name, typeof value === 'string' ? decodedText(value, `${section}/${name}`, log) : value === null ? '' : String(value)] as const;
    });
  return GrtFields.fromColumns(columns, section, log);
}

/** GRT's escape of a character in the database's text: `\u` and four hexadecimal digits. */
const ESCAPED_CHARACTER = /\\u([0-9a-fA-F]{4})/g;

/**
 * A text column as GRT shows it. GRT stores some characters escaped as in JSON (`.300 HAM\u0027R`,
 * `.416 Rigby N\u00b02`, `\u000d` for a line break in a note: docs/formats/grt-database.md), and the
 * escape is decoded, with a note saying so.
 */
function decodedText(text: string, path: string, log: IssueLog): string {
  const decoded = text.replace(ESCAPED_CHARACTER, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  if (decoded !== text) log.info('escaped-text', 'GRT stores this text with \\u escapes; they were decoded.', path);
  return decoded;
}
