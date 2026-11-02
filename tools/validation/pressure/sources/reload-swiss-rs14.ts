/**
 * Reload Swiss's RS14 datasheet (Nitrochemie Wimmis, 2023): a table of start and maximum loads with the
 * measured V5 velocity and pressure in bar, and a temperature study of one .308 Win. subsonic load,
 * 10 shots a group. The article that reports the same study (J. Krcmar, February 2024) adds the case
 * (Lapua) and primer (S&B LR), and labels the pressure "Pmax mean value".
 *
 * Neither document states how the pressure was measured. Nitrochemie is a powder maker and the units
 * (Pmax, V5) are CIP's, but the method is recorded as not stated: these conditions are scored apart from
 * the stated piezoelectric ones until it is known.
 *
 * The conditions are read from the PDF the user downloaded (its SHA-256 is checked), never from a copy
 * in this repository: the table is the maker's.
 */
import { units } from '@gordons-legacy/formats';
import { input, type PressureCondition, type PressureSource, type ProjectileConstruction } from '../conditions.ts';

export const RS14_SOURCE: PressureSource = {
  id: 'reload-swiss-rs14-2023',
  title: 'RS14 Rifle-/Pistol Powder, datasheet with reloading data',
  publisher: 'Nitrochemie Wimmis AG (Reload Swiss)',
  laboratory: 'Reload Swiss (not stated further)',
  url: 'https://www.reload-swiss.com/Reload%20Swiss/Produkte/Englich/RS14/DB_RS14_eng_fin.pdf',
  sha256: '2da9286b5c1e7af2607a2e371ca061465c3b792d5ed3a2da3cfda94e3643345b',
  method: 'not-stated',
  quantity: 'not-stated',
  methodNote:
    'Page 2 heads its columns "V5 m/s" and "Pressure bar"; the temperature study labels its row "Pmax" with an SD over 10 shots. ' +
    'No transducer, test barrel standard or laboratory is named. The article (reload-swiss.com, "RS14 rifle calibre", ' +
    'February 2024) labels the same figures "Pmax mean value" and does not state the method either.',
};

/** The table's cartridge names, mapped to the caliber definitions the pool holds. */
const CALIBERS: Record<string, string> = {
  '38 Special': '.38 Special',
  '357 Magnum': '.357 Mag.',
  '45 ACP (Auto)': '.45 Auto',
  // The Lapua case is the article's, for the subsonic study; the other .308 rows name no case.
  '308 Win.': '.308 Win. Lapua #1',
};

/** The table's projectiles that the specification table holds, by the sheet's `mass type producer`. */
const PROJECTILES: Record<string, string> = {
  '200 B416 Subsonic Lapua': 'lapua-b416-200',
  '190 Sub-X Hornady': 'hornady-sub-x-190',
  '240 HPBT MK Sierra': 'sierra-matchking-240',
};

const PISTOL_CARTRIDGES = new Set(['38 Special', '357 Magnum', '44 Rem Mag', '45 ACP (Auto)', '45 Colt']);
const PRIMERS = new Set(['SP', 'LP', 'LR', 'LRM', 'BMG']);

/** A row of the table: one projectile in one cartridge, with its start and maximum loads. */
export interface Rs14Row {
  cartridge: string;
  barrel: string;
  mass: number;
  type: string;
  producer: string;
  start: { charge: number; velocity: number; pressure: number };
  maximum: { charge: number; velocity: number; pressure: number };
  overallLength: number;
  /** The row the temperature study repeats (marked * in the sheet). */
  temperatureStudy: boolean;
  /** The sheet's line, for the condition's location. */
  line: number;
}

/** One column of the temperature study. */
export interface Rs14Temperature {
  celsius: number;
  velocity: number;
  pressure: number;
  pressureSd: number;
}

const ROW =
  /^\s*(?:(?<lead>\S.*?)\s{2,})?(?<mass>\d{2,3})(?<star>\*)?\s+(?<middle>\S.*?)\s+(?<startCharge>\d+\.\d)\s+(?<startVelocity>\d+)\s+(?<startPressure>\d{1,3}(?:,\d{3})?)\s+(?<maxCharge>\d+\.\d)\s+(?<maxVelocity>\d+)\s+(?<maxPressure>\d{1,3}(?:,\d{3})?)\s+(?<length>\d+\.\d)\s*$/;
const BARREL = /^\s*(\d+ mm \(1:[\d.]+ ?(?:''|"|”)\))/;

/** A line that looks like a row: a projectile mass, then at least two charges (numbers with a decimal). */
const ROW_START = /^\s*(?:\S.*?\s{2,})?\d{2,3}\*?\s+\S/;
const rowLike = (line: string) => ROW_START.test(line) && (line.match(/\d\.\d/g) ?? []).length >= 2;

/**
 * Reads the table of page 2 from `pdftotext -layout` output. A line that looks like a row but can't be
 * read is returned in `unread`, never dropped silently.
 */
export function readRs14Table(text: string): { rows: Rs14Row[]; unread: string[] } {
  const rows: Rs14Row[] = [];
  const unread: string[] = [];
  const barrels = new Map<string, string>();
  let cartridge = '';
  text.split('\n').forEach((line, index) => {
    const barrel = BARREL.exec(line);
    if (barrel && cartridge) barrels.set(cartridge, barrel[1]!);
    const match = ROW.exec(line);
    if (!match?.groups) {
      if (rowLike(line)) unread.push(`line ${index + 1}: ${line.trim()}`);
      return;
    }
    const { lead, mass, star, middle, startCharge, startVelocity, startPressure, maxCharge, maxVelocity, maxPressure, length } = match.groups;
    if (lead && !BARREL.test(lead)) cartridge = lead.trim();
    const cells = middle!.split(/\s{2,}/);
    if (cells.length > 1 && PRIMERS.has(cells[cells.length - 1]!)) cells.pop();
    const number = (text: string) => Number(text.replace(/,/g, ''));
    rows.push({
      cartridge,
      barrel: '',
      mass: number(mass!),
      type: cells[0]!.trim(),
      producer: (cells[1] ?? '').trim(),
      start: { charge: number(startCharge!), velocity: number(startVelocity!), pressure: number(startPressure!) },
      maximum: { charge: number(maxCharge!), velocity: number(maxVelocity!), pressure: number(maxPressure!) },
      overallLength: number(length!),
      temperatureStudy: star === '*',
      line: index + 1,
    });
  });
  return { rows: rows.map((row) => ({ ...row, barrel: barrels.get(row.cartridge) ?? '' })), unread };
}

/** Reads the temperature study under the table. */
export function readRs14Temperatures(text: string): Rs14Temperature[] {
  const values = (label: RegExp) => {
    const line = text.split('\n').find((candidate) => label.test(candidate));
    return line ? [...line.replace(label, '').matchAll(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, ''))) : [];
  };
  const temperatures = values(/^\s*Temperature\s+°C/);
  const velocities = values(/^\s*V5 mean\s+m\/s/);
  const pressures = values(/^\s*Pmax\s+bar/);
  const deviations = values(/^\s*Pmax SD\s+bar/);
  if ([velocities, pressures, deviations].some((column) => column.length !== temperatures.length)) {
    throw new Error(`the temperature study's rows don't line up (${temperatures.length} temperatures): check the document's text`);
  }
  return temperatures.map((celsius, index) => ({
    celsius,
    velocity: velocities[index]!,
    pressure: pressures[index]!,
    pressureSd: deviations[index]!,
  }));
}

/** The sheet's barrel cell, `450 mm (1:8'')`: length and twist, m. */
function barrelOf(cell: string): { length: number; twist: number } | undefined {
  const match = /(\d+) mm \(1:([\d.]+)/.exec(cell);
  return match ? { length: Number(match[1]) * units.MILLIMETRE, twist: Number(match[2]) * units.INCH } : undefined;
}

function construction(row: Rs14Row): ProjectileConstruction {
  const pistol = PISTOL_CARTRIDGES.has(row.cartridge);
  if (/solid/i.test(row.type)) return 'rifle-solid-copper';
  // H&N's HS bullets are plated lead; Ares's EPRX are coated cast lead (their makers' pages).
  const lead = /EPRX|\bHS\b|\bWC\b|LRN|SWC|\bFP\b/.test(row.type);
  if (pistol) return lead ? 'pistol-lead' : 'pistol-jacketed';
  return lead ? 'rifle-lead' : 'rifle-jacketed';
}

/** The table's start and maximum loads and the temperature study, as conditions. */
export function rs14Conditions(text: string): { conditions: PressureCondition[]; unread: string[] } {
  const conditions: PressureCondition[] = [];
  const temperatures = readRs14Temperatures(text);
  const { rows, unread } = readRs14Table(text);
  for (const row of rows) {
    const barrel = barrelOf(row.barrel);
    const series = `${RS14_SOURCE.id}/${row.cartridge}/${row.mass} ${row.type} ${row.producer}`;
    const key = PROJECTILES[`${row.mass} ${row.type} ${row.producer}`] ?? `${row.producer} ${row.type} ${row.mass} gr`;
    const common = {
      source: RS14_SOURCE.id,
      series,
      caliber: CALIBERS[row.cartridge] ?? row.cartridge,
      powder: { maker: 'Reload Swiss', product: 'RS 14' },
      projectile: {
        name: `${row.producer} ${row.type}`,
        mass: input(row.mass * units.GRAIN, 'published' as const, `${row.mass} gr`),
        key,
        construction: construction(row),
      },
      overallLength: input(row.overallLength * units.MILLIMETRE, 'published' as const, `${row.overallLength} mm`),
      barrelLength: barrel ? input(barrel.length, 'published', row.barrel) : input(0, 'assumed', 'barrel not read'),
      ...(barrel ? { twistLength: input(barrel.twist, 'published', row.barrel) } : {}),
      velocityDistance: 5,
      // GRT's RS14 model comes with no derivation; whether it was fitted to this table is unknown.
      fitting: 'unknown' as const,
    };
    const loads = [
      ['start', row.start],
      ['maximum', row.maximum],
    ] as const;
    for (const [name, load] of loads) {
      const studied = row.temperatureStudy && name === 'start';
      conditions.push({
        ...common,
        id: `${RS14_SOURCE.id}/p2-l${row.line}/${name}`,
        location: `page 2, line ${row.line} of the text, ${name} load`,
        charge: input(load.charge * units.GRAIN, 'published', `${load.charge} gr`),
        pressure: input(load.pressure * units.BAR, 'published', `${load.pressure} bar`),
        velocity: input(load.velocity, 'published', `${load.velocity} m/s (V5)`),
        ...(studied
          ? {
              temperature: input(units.celsiusToKelvin(21), 'published', '21 °C, from the temperature study this row repeats'),
              shots: 10,
              note: 'The temperature study\'s 21 °C column repeats this row; the article adds the Lapua case and S&B LR primer.',
            }
          : {}),
      });
    }
    if (!row.temperatureStudy) continue;
    for (const column of temperatures.filter(({ celsius }) => celsius !== 21)) {
      conditions.push({
        ...common,
        id: `${RS14_SOURCE.id}/p2-temperature/${column.celsius}`,
        location: `page 2, temperature study, ${column.celsius} °C`,
        charge: input(row.start.charge * units.GRAIN, 'published', `${row.start.charge} gr`),
        temperature: input(units.celsiusToKelvin(column.celsius), 'published', `${column.celsius} °C`),
        pressure: input(column.pressure * units.BAR, 'published', `${column.pressure} bar, SD ${column.pressureSd} bar`),
        velocity: input(column.velocity, 'published', `${column.velocity} m/s (V5 mean)`),
        shots: 10,
      });
    }
  }
  return { conditions, unread };
}
