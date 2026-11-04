/**
 * The component tables of GRT's database (`GordonsReloadingTool.db`, GRT 2021.2030) and their columns in
 * the order of their `CREATE TABLE` statements, as SQLite's schema table holds them (read from a running
 * GRT's memory, 2026-10-14; docs/formats/grt-database.md). A record lists its values in this order.
 *
 * The columns are named as in GRT's component files (`.caliber`, `.projectile`, `.propellant`), except
 * the three spellings of the projectile table that grt-database-import.ts maps.
 */
export const GRT_DATABASE_COLUMNS = {
  caliber: [
    'id', 'cipname', 'altname', 'standard', 'ciporigin', 'ciptype', 'cipdate', 'ciprevdate', 'cippdf', 'L0',
    'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'R', 'R1', 'R3', 'E', 'E1', 'Emin', 'delta', 'FG', 'beta', 'P0', 'P1',
    'P2', 'alpha', 'S', 'r1min', 'r2', 'H1', 'H2', 'G1', 'G2', 'f', 'L3G', 'Pmax', 'PK', 'PE', 'EE', 'V', 'M',
    'c_L0', 'c_L1', 'c_L2', 'c_L3', 'c_R', 'c_R1', 'c_R2', 'c_R3', 'c_r_', 'c_E', 'c_P0', 'c_P1', 'c_P2',
    'c_alpha', 'c_S', 'c_r1max', 'c_r2_', 'c_H1', 'c_H2', 'c_G', 'c_G1', 'c_alpha1', 'c_h_', 'c_s_', 'c_i_',
    'c_w_', 'c_F', 'c_Z', 'c_b_', 'c_N', 'c_u_', 'c_Q', 'c_delta', 'c_Fe', 'c_Fe_proof', 'c_Fe_auto', 'sebert',
    'cdate', 'cby', 'mdate', 'mby', 'type', 'mode', 'status', 'origin', 'descr', 'geloescht',
  ],
  projectile: [
    'id', 'mname', 'pname', 'lotid', 'caliber', 'gdia', 'glen', 'gmass', 'gpressure', 'gfriction', 'gtaildiaA',
    'gtaildiaB', 'gtailh', 'gtailtype', 'gdepthmax', 'g1bc', 'g7bc', 'gUBCS', 'cdate', 'cby', 'mdate', 'mby',
    'type', 'mode', 'status', 'origin', 'descr', 'imageUuid', 'geloescht',
  ],
  propellant: [
    'id', 'mname', 'pname', 'lotid', 'Br', 'Bp', 'Brp', 'Ba', 'Qex', 'k', 'eta', 'a0', 'a1', 'z1', 'z2', 'pc',
    'pcd', 'pt', 'tcc', 'tch', 'Lp', 'Lr', 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09',
    'Qlty', 'cdate', 'cby', 'mdate', 'mby', 'type', 'mode', 'status', 'origin', 'descr', 'imageUuid',
    'imageDetailUuid', 'geloescht',
  ],
} as const;

export type GrtDatabaseTable = keyof typeof GRT_DATABASE_COLUMNS;

/** A value as SQLite stores it in these tables: text, a number, or NULL. */
export type GrtDatabaseValue = string | number | null;

/** One record of a table, by column name. */
export type GrtDatabaseRecord = Readonly<Record<string, GrtDatabaseValue>>;

/**
 * A record from its row id and its values in column order, or undefined when the number of values
 * isn't the table's: the record was read from another version of the schema, or read wrongly.
 *
 * The `id` column is SQLite's alias of the row id, which SQLite stores as NULL in the record itself
 * (sqlite.org/fileformat2.html, "Record Format"); it is filled in from `rowid`.
 */
export function grtDatabaseRecord(
  table: GrtDatabaseTable,
  rowid: number,
  values: readonly GrtDatabaseValue[],
): GrtDatabaseRecord | undefined {
  const columns = GRT_DATABASE_COLUMNS[table];
  if (values.length !== columns.length) return undefined;
  const record: Record<string, GrtDatabaseValue> = Object.fromEntries(columns.map((column, index) => [column, values[index]!]));
  record['id'] = rowid;
  return record;
}
