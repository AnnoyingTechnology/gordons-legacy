/**
 * Western Powders' Handloading Guide, Edition 8.0 (Accurate and Ramshot powders), as published by
 * Hodgdon: each row gives a projectile, a start charge and its velocity, a maximum charge with its
 * velocity and **the pressure of the maximum charge**, in psi, and the overall length.
 *
 * The guide states its method: loads "generated at the ballistics test facilities of Western Powders,
 * Inc. in accordance with SAAMI guidelines", fired through test barrels (printed page 20), and "modern
 * ballistic labs use piezoelectric transducers" (the pressure section). Only the maximum charge carries a
 * pressure; the column "Max Pressure" is not a second measurement of the start charge.
 *
 * The rows are read from `pdftotext -raw` output of the user's copy (the layout mode interleaves the
 * page's columns). The PDF's text spaces out every
 * character of a row (`3 8 .0 2 , 7 3 6`), so a row is read with its spaces removed; a row whose
 * projectile name ends in digits (a cast bullet's mould number) can't be split reliably and is left out.
 */
import { units } from '@gordons-legacy/formats';
import { input, type PressureCondition, type PressureSource } from '../conditions.ts';

export const WESTERN_8_SOURCE: PressureSource = {
  id: 'western-powders-8.0',
  title: 'Western Powders Handloading Guide, Edition 8.0',
  publisher: 'Western Powders, Inc. (published by Hodgdon)',
  laboratory: 'Western Powders, Inc. ballistics test facilities',
  url: 'https://hodgdonpowderco.com/wp-content/uploads/2023/04/WesternPowdersHandloadingGuide8.0_WEB-1.pdf',
  sha256: '99a8490f93348237da819c3a6b645e0f3e63d7c259a38c6dcf93a05302765d86',
  method: 'piezo-saami',
  quantity: 'not-stated',
  methodNote:
    'Printed page 20: "generated at the ballistics test facilities of Western Powders, Inc. in accordance with SAAMI ... ' +
    'guidelines. All loads were fired through test barrels." The pressure section: "Modern ballistic labs use piezoelectric ' +
    'transducers to measure pressure in pounds per square inch." Shot counts, temperature and the averaging are not given.',
};

/** One row of a table: a projectile with its start and maximum loads. */
export interface WesternRow {
  cartridge: string;
  powder: string;
  barrel: string;
  caseMake: string;
  mass: number;
  /** Maker abbreviation and bullet type with the spaces removed, as the PDF lets them be read: `HDYSST`. */
  projectile: string;
  start: { charge: number; velocity: number };
  maximum: { charge: number; velocity: number; pressure: number };
  overallLength: number;
  compressed: boolean;
  line: number;
}

const ROW = /^(\d{2,3})(\D.*?[^\d\s])(\d{1,3}\.\d)(\d,\d{3}|\d{3})(\d{1,3}\.\d)(\d,\d{3}|\d{3})(\d{2},\d{3})(\d\.\d{3})(C?)$/;
const POWDER = /^(ACCURATE|RAMSHOT) ([A-Z0-9 .#\-]+?)( \(continued\))?$/;
const CONTINUED = / \(continued\)$/;

/** A line that looks like a row of the tables. */
const ROW_LIKE = /^\d{2,3}\D.*\d\.\d{3}C?$/;
/**
 * A pressure note some cartridges print between their name and their `Barrel:` line (`55,000 PSI --
 * STANDARD SAAMI COMMERCIAL SPECIFICATIONS` under `223 REMINGTON`): the name is the line above it.
 */
const PRESSURE_NOTE = /^\d[\d,]*\s*(?:PSI|CUP)\b/;

/**
 * Reads every complete row, with the cartridge, powder, barrel and case it is printed under. A line that
 * looks like a row but can't be read is returned in `unread`, never dropped silently.
 */
export function readWesternRows(text: string): { rows: WesternRow[]; unread: string[] } {
  const lines = text.split('\n').map((line) => line.trim());
  const rows: WesternRow[] = [];
  const unread: string[] = [];
  let cartridge = '';
  let powder = '';
  const barrels = new Map<string, string>();
  const cases = new Map<string, string>();
  lines.forEach((line, index) => {
    const next = lines[index + 1] ?? '';
    if (next.startsWith('Barrel:')) {
      cartridge = (PRESSURE_NOTE.test(line) ? (lines[index - 1] ?? '') : line).replace(CONTINUED, '');
      barrels.set(cartridge, next.replace(/\s/g, ''));
      const caseLine = lines[index + 2] ?? '';
      if (caseLine.startsWith('Case:')) cases.set(cartridge, /^Case:([^¦]*)/.exec(caseLine)?.[1]?.replace(/\s/g, '') ?? '');
      return;
    }
    if (CONTINUED.test(line) && !POWDER.test(line) && barrels.has(line.replace(CONTINUED, ''))) {
      cartridge = line.replace(CONTINUED, '');
      return;
    }
    if (PRESSURE_NOTE.test(line)) return;
    const powderMatch = POWDER.exec(line);
    if (powderMatch) {
      powder = `${powderMatch[1]} ${powderMatch[2]}`;
      return;
    }
    const compact = line.replace(/\s/g, '');
    const match = ROW.exec(compact);
    if (!match || !cartridge || !powder) {
      if (ROW_LIKE.test(compact)) unread.push(`line ${index + 1}: ${line}`);
      return;
    }
    const number = (text: string) => Number(text.replace(/,/g, ''));
    const row: WesternRow = {
      cartridge,
      powder,
      barrel: barrels.get(cartridge) ?? '',
      caseMake: cases.get(cartridge) ?? '',
      mass: number(match[1]!),
      projectile: match[2]!,
      start: { charge: number(match[3]!), velocity: number(match[4]!) },
      maximum: { charge: number(match[5]!), velocity: number(match[6]!), pressure: number(match[7]!) },
      overallLength: number(match[8]!),
      compressed: match[9] === 'C',
      line: index + 1,
    };
    // A split that reads a mould number as a charge gives a start charge above the maximum.
    if (row.start.charge < row.maximum.charge && row.start.velocity < row.maximum.velocity) rows.push(row);
    else unread.push(`line ${index + 1}: ${line}`);
  });
  return { rows, unread };
}

/** `Barrel:24”¦Twist:1-10”¦...`: length and twist, m. */
function barrelOf(cell: string): { length: number; twist?: number } | undefined {
  // The guide prints inches as ” on most pages and " on some.
  const length = /Barrel:([\d.]+)["”]/.exec(cell);
  const twist = /Twist:1-([\d.]+)["”]/.exec(cell);
  if (!length) return undefined;
  return { length: Number(length[1]) * units.INCH, ...(twist ? { twist: Number(twist[1]) * units.INCH } : {}) };
}

/** The guide's cartridges with a WIN case, mapped to the community caliber definitions of the same case. */
const CALIBERS: Record<string, string> = {
  '300 WINCHESTER SHORT MAGNUM (WSM)': '.300 WSM Winchester Brand',
  '30 NOSLER': '.30 Nosler',
  '26 NOSLER': '.26 Nosler',
  '7MM PRC': '7 PRC',
  '300 PRC': '.300 PRC Corrected',
  '6.8 WESTERN': '6.8 Western',
  '308 WINCHESTER': '.308 Win. Winchester',
  '6.5 CREEDMOOR': '6.5 Creedmoor',
  '300 AAC BLACKOUT': '.300 AAC Blackout',
};

/** The guide's projectiles that the specification table or the pool holds: `mass` + spaceless name. */
const PROJECTILES: Record<string, string> = {
  '210BERGERBTTLR': 'berger-30419',
  '230BERGERHYBRID': 'berger-30430',
  // Berger makes its 190 gr VLD as a hunting bullet only.
  '190BERGERVLD': 'berger-30514',
  '240SIERRAHPBTMK': 'sierra-matchking-240',
  '180NOSLERE-TIP': 'nosler-e-tip-180',
  '168BARNESTTSX': 'barnes-ttsx-168',
  '180BARNESTTSX': 'barnes-ttsx-180',
  '168SIERRATMK': 'sierra-tmk-168',
  '175SIERRATMK': 'sierra-tmk-175',
  '110SIERRAHP': 'sierra-hp-110',
  '165SIERRAHPBTGK': 'sierra-gameking-165-hpbt',
  '180SIERRASBTGK': 'sierra-gameking-180-sbt',
  '168HDYA-MAX': 'hornady-a-max-168',
  '150HDYBTSP': 'hornady-btsp-150',
  '165HDYSST': 'hornady-sst-165',
  '200BARNESLRXBT': 'barnes-lrx-200',
  '150NOSLERA-BOND': 'nosler-accubond-150',
  '200NOSLERA-BOND': 'nosler-accubond-200',
  '220NOSLERPART': 'nosler-partition-220',
  // Not mapped: `225 HDYBTHP`, which Hornady sells today only as the ELD Match, a different bullet.
};

/** The guide's powder heading as a maker and product: `ACCURATE MAGPRO` → Accurate, MAGPRO. */
function powderOf(heading: string): { maker: string; product: string } {
  const [maker = '', ...product] = heading.split(' ');
  return { maker: maker.charAt(0) + maker.slice(1).toLowerCase(), product: product.join(' ') };
}

/**
 * The maximum loads with their pressure, and the start loads with their velocity only, for every
 * powder: a powder without a model in the pool is then reported as missing, like any other component.
 */
export function westernConditions(text: string): { conditions: PressureCondition[]; unread: string[] } {
  const conditions: PressureCondition[] = [];
  const { rows, unread } = readWesternRows(text);
  for (const row of rows) {
    const powder = powderOf(row.powder);
    const barrel = barrelOf(row.barrel);
    const key = PROJECTILES[`${row.mass}${row.projectile}`] ?? `${row.projectile} ${row.mass} gr`;
    const series = `${WESTERN_8_SOURCE.id}/${row.cartridge}/${row.powder}/${row.mass} ${row.projectile}`;
    const common = {
      source: WESTERN_8_SOURCE.id,
      series,
      caliber: CALIBERS[row.cartridge] ?? row.cartridge,
      powder,
      projectile: {
        name: row.projectile,
        mass: input(row.mass * units.GRAIN, 'published' as const, `${row.mass} gr`),
        key,
        construction: 'rifle-jacketed' as const,
      },
      overallLength: input(row.overallLength * units.INCH, 'published' as const, `${row.overallLength} in`),
      barrelLength: barrel ? input(barrel.length, 'published', `${barrel.length / units.INCH} in`) : input(0, 'assumed', 'barrel not read'),
      ...(barrel?.twist ? { twistLength: input(barrel.twist, 'published', `1:${barrel.twist / units.INCH} in`) } : {}),
      // The community's Accurate MAGPRO model names no derivation; whether it was fitted to this guide is unknown.
      fitting: 'unknown' as const,
      note: `case: ${row.caseMake || 'not read'}${row.compressed ? '; compressed load' : ''}`,
    };
    conditions.push({
      ...common,
      id: `${WESTERN_8_SOURCE.id}/l${row.line}/maximum`,
      location: `text line ${row.line}, maximum load`,
      charge: input(row.maximum.charge * units.GRAIN, 'published', `${row.maximum.charge} gr`),
      pressure: input(row.maximum.pressure * units.PSI, 'published', `${row.maximum.pressure} psi`),
      velocity: input(row.maximum.velocity * units.FOOT_PER_SECOND, 'published', `${row.maximum.velocity} ft/s`),
    });
    conditions.push({
      ...common,
      id: `${WESTERN_8_SOURCE.id}/l${row.line}/start`,
      location: `text line ${row.line}, start load (velocity only)`,
      charge: input(row.start.charge * units.GRAIN, 'published', `${row.start.charge} gr`),
      velocity: input(row.start.velocity * units.FOOT_PER_SECOND, 'published', `${row.start.velocity} ft/s`),
    });
  }
  return { conditions, unread };
}
