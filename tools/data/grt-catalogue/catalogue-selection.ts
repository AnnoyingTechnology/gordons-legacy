import {
  importGrtDatabaseCaliber,
  importGrtDatabaseProjectile,
  importGrtDatabasePropellant,
  type CaliberDefinition,
  type GrtDatabaseRecord,
  type GrtDatabaseTable,
  type ImportIssue,
  type Projectile,
  type Propellant,
} from '@gordons-legacy/formats';

/**
 * Which records of GRT's database become the published catalogue (issue #19), and why the others
 * don't. The catalogue is GRT's own data as GRT offered it to its users: nothing a user of the
 * maintainer's copy added, nothing GRT deleted or hid, nothing the importer had to guess on.
 */

/** Why a record is left out of the catalogue. */
export type ExclusionReason =
  /** `geloescht` (German for "deleted") is set: GRT deleted it but kept the row. */
  | 'deleted'
  /** Created by someone other than GRT (`cby`): an entry a user of this copy made or imported. */
  | 'made by a user'
  /**
   * A powder model whose `mode` is `hidden`: GRT no longer offers it — an earlier fit of a powder
   * with a newer one, a development iteration (`DEV` lots), or a model withdrawn whole. Offering a
   * withdrawn model would offer a pressure prediction its own author no longer stood by.
   */
  | 'hidden by GRT'
  /** The importer reported an error or a warning: the record is unusable, or would need a guess. */
  | 'rejected by the importer';

export type CatalogueEntry =
  | { table: 'caliber'; row: number; value: CaliberDefinition }
  | { table: 'projectile'; row: number; value: Projectile }
  | { table: 'propellant'; row: number; value: Propellant };

export interface ExcludedRecord {
  table: GrtDatabaseTable;
  row: number;
  /** What the record is, for a reader of the report: the cartridge, or maker, product and lot. */
  name: string;
  reason: ExclusionReason;
  /** The importer's issues, for a rejected record. */
  issues: ImportIssue[];
}

/** A record as a catalogue entry, or why it isn't one. */
export function selectRecord(table: GrtDatabaseTable, record: GrtDatabaseRecord): CatalogueEntry | ExcludedRecord {
  const row = Number(record['id']);
  const excluded = (reason: ExclusionReason, issues: ImportIssue[] = []): ExcludedRecord => ({ table, row, name: recordName(table, record), reason, issues });
  if (record['geloescht'] !== 0) return excluded('deleted');
  if (record['cby'] !== 'GRT') return excluded('made by a user');
  if (table === 'propellant' && record['mode'] === 'hidden') return excluded('hidden by GRT');
  const result = importRecord(table, record);
  if (!result.ok || result.issues.some((issue) => issue.severity !== 'info')) return excluded('rejected by the importer', result.issues);
  return { table, row, value: result.value } as CatalogueEntry;
}

export function isExcluded(selection: CatalogueEntry | ExcludedRecord): selection is ExcludedRecord {
  return 'reason' in selection;
}

function importRecord(table: GrtDatabaseTable, record: GrtDatabaseRecord) {
  if (table === 'caliber') return importGrtDatabaseCaliber(record);
  if (table === 'projectile') return importGrtDatabaseProjectile(record);
  return importGrtDatabasePropellant(record);
}

/** The cartridge's name, or the maker, product and lot, as GRT's lists show them. */
export function recordName(table: GrtDatabaseTable, record: GrtDatabaseRecord): string {
  const text = (column: string) => String(record[column] ?? '');
  if (table === 'caliber') return text('cipname');
  return [text('mname'), text('pname'), text('lotid')].filter((part) => part !== '').join(' ');
}
