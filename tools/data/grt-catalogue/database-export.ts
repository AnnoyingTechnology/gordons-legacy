import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { grtDatabaseRecord, type GrtDatabaseRecord, type GrtDatabaseTable, type GrtDatabaseValue } from '@gordons-legacy/formats';

/**
 * The export of GRT's database the maintainer made (2026-11-04, docs/formats/grt-database.md): one
 * `<table>.json` per table, each a list of `{ rowid, cols }` with the values in the order of the
 * table's columns.
 */

export interface TableExport {
  table: GrtDatabaseTable;
  records: GrtDatabaseRecord[];
  /** Rows whose number of values isn't the table's, by row id: read wrongly, or another schema. */
  unreadableRows: number[];
  /**
   * Row ids below the highest one that no row has. SQLite gives a table with AUTOINCREMENT ever larger
   * ids and may skip one, so a gap is a deleted row or an insert that never happened
   * (docs/formats/grt-database.md: the powder table's B-tree has no cell for any of its gaps).
   */
  missingRowIds: number[];
}

interface ExportedRow {
  rowid: number;
  cols: GrtDatabaseValue[];
}

export function readTableExport(folder: string, table: GrtDatabaseTable): TableExport {
  const rows = JSON.parse(readFileSync(join(folder, `${table}.json`), 'utf8')) as ExportedRow[];
  const records: GrtDatabaseRecord[] = [];
  const unreadableRows: number[] = [];
  for (const row of rows) {
    const record = grtDatabaseRecord(table, row.rowid, row.cols);
    if (record === undefined) unreadableRows.push(row.rowid);
    else records.push(record);
  }
  const present = new Set(rows.map((row) => row.rowid));
  const highest = Math.max(0, ...present);
  const missingRowIds = Array.from({ length: highest }, (_, index) => index + 1).filter((id) => !present.has(id));
  return { table, records, unreadableRows, missingRowIds };
}

/** The day the export was written (its files' modification date), YYYY-MM-DD. */
export function exportDate(folder: string): string {
  return statSync(join(folder, 'caliber.json')).mtime.toISOString().slice(0, 10);
}
