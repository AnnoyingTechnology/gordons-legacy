/**
 * Reads velocities from a chronograph's CSV export (LabRadar, MagnetoSpeed, Caldwell, ProChrono and
 * others), without knowing the device: the columns of numbers are found, the velocity column and its
 * unit guessed from the headers. The guesses are only suggestions; the user confirms them.
 */

export type VelocityUnit = 'm/s' | 'ft/s';

export interface CsvColumn {
  /** The header above the column, or "Column n". */
  header: string;
  /** The column's numbers, in file order. */
  values: number[];
}

export interface ChronographCsv {
  /** Columns that could be velocities: positive numbers in a plausible range. */
  columns: CsvColumn[];
  /** Index in `columns` of the most likely velocity column. */
  suggestedColumn: number;
  /** The unit stated in the file, if any. */
  statedUnit?: VelocityUnit;
}

/** Plausible velocities in either unit: from slow subsonic loads (m/s) to fast rifle loads (ft/s). */
const PLAUSIBLE = { min: 50, max: 5000 };
const VELOCITY_HEADER = /\b(v0|vel|velocity|speed|vitesse|geschw|velocidad|velocit)/i;
const FEET = /\b(fps|ft\/s|feet)\b/i;
const METRES = /\b(m\/s|mps|meters per second|metres per second)\b/i;

export function readChronographCsv(text: string): ChronographCsv | undefined {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return undefined;
  const delimiter = detectDelimiter(lines);
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, '')));
  // A column's values are its longest unbroken run of numbers (the data table, not the header block
  // above it); its header is the cell just above that run.
  const width = Math.max(...rows.map((row) => row.length));
  const columns: CsvColumn[] = [];
  for (let index = 0; index < width; index++) {
    let best = { start: 0, values: [] as number[] };
    let current = { start: 0, values: [] as number[] };
    rows.forEach((row, rowIndex) => {
      const value = readNumber(row[index] ?? '');
      if (value === undefined) {
        current = { start: rowIndex + 1, values: [] };
        return;
      }
      current.values.push(value);
      if (current.values.length >= best.values.length) best = current;
    });
    const header = best.start > 0 ? (rows[best.start - 1]?.[index] ?? '') : '';
    const plausible = best.values.length > 0 && best.values.every((value) => value >= PLAUSIBLE.min && value <= PLAUSIBLE.max);
    if (plausible) columns.push({ header: header || `Column ${index + 1}`, values: best.values });
  }
  if (columns.length === 0) return undefined;
  const byHeader = columns.findIndex((column) => VELOCITY_HEADER.test(column.header));
  const statedUnit = FEET.test(text) && !METRES.test(text) ? 'ft/s' : METRES.test(text) && !FEET.test(text) ? 'm/s' : undefined;
  return { columns, suggestedColumn: byHeader >= 0 ? byHeader : 0, ...(statedUnit ? { statedUnit } : {}) };
}

/** The delimiter that splits most lines into the same number of cells: ;, tab or comma. */
function detectDelimiter(lines: string[]): string {
  const scores = [';', '\t', ','].map((delimiter) => {
    const counts = lines.map((line) => line.split(delimiter).length);
    const most = Math.max(...counts);
    return { delimiter, score: most > 1 ? counts.filter((count) => count === most).length : 0 };
  });
  return scores.sort((a, b) => b.score - a.score)[0]!.delimiter;
}

/** A number written with a dot or a comma as decimal separator (a comma only with ; or tab files). */
function readNumber(cell: string): number | undefined {
  if (!/^[-+]?\d+([.,]\d+)?$/.test(cell)) return undefined;
  return Number(cell.replace(',', '.'));
}
