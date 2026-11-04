/**
 * Hodgdon's 2025 Annual Manual (Hodgdon, IMR, Winchester and Accurate/Ramshot powders), from Hodgdon's
 * Reloading Manuals Library: for each cartridge, its test barrel and twist; for each bullet, its case,
 * primer and cartridge overall length; for each powder, a start and a maximum charge, each with its
 * velocity and its pressure, `PSI` or `CUP`; the subsonic tables give one recommended charge instead.
 *
 * The manual states its method (printed page 56, "Pressures were gauged by one of two methods"): CUP
 * "mechanically" with a copper crusher, PSI "electronically with a transducer", "a force transducer,
 * which rests against the cartridge in the chamber" — SAAMI's conformal piezoelectric method — in
 * "pressure barrels", standard cartridges to SAAMI's guidelines. CUP rows keep their velocity and lose
 * their pressure: CUP is not a pressure and is never converted. Shots, temperature and averaging are not
 * given.
 *
 * The pages set two columns of tables side by side. `pdftotext -layout` keeps them on the same lines, so
 * each page is cut at its second `Powder` heading and the left column read before the right one; a
 * table runs on across columns and pages, so the cartridge, bullet and case read last stay in force.
 */
import { units } from '@gordons-legacy/formats';
import { input, type PressureCondition, type PressureSource, type ProjectileConstruction } from '../conditions.ts';

export const HODGDON_MANUAL_2025_SOURCE: PressureSource = {
  id: 'hodgdon-annual-manual-2025',
  title: 'Hodgdon 2025 Annual Manual',
  publisher: 'Hodgdon Powder Company',
  laboratory: 'Hodgdon (not stated further)',
  url: 'https://hodgdonpowderco.com/wp-content/uploads/2026/04/AM25.pdf',
  sha256: 'ee592615a3488b87301033eb0544b880557bfc4e6ec2bbf78c59dac5d81a01dc',
  method: 'piezo-saami',
  quantity: 'not-stated',
  methodNote:
    'Printed page 56: "Pressures were gauged by one of two methods: mechanically with Copper Units of Pressure (CUP) or ' +
    'electronically with a transducer as Pounds per Square Inch (PSI) ... The electronic method utilizes a force transducer, ' +
    'which rests against the cartridge in the chamber"; loads "fired in pressure barrels", standard cartridges to SAAMI\'s ' +
    'guidelines. CUP rows carry no pressure here. Shots, temperature and averaging are not stated.',
};

/** One powder row of a table, with the cartridge, barrel, bullet and case it is printed under. */
export interface ManualRow {
  cartridge: string;
  /** `24”`, as printed. */
  barrel: string;
  /** `1:16”`, as printed. */
  twist: string;
  /** `30 GR. BAR VG FB`. */
  bullet: string;
  mass: number;
  /** Inches. */
  diameter: number;
  caseMake: string;
  /** Inches. */
  overallLength: number;
  powder: string;
  /** A start and a maximum load, or the one recommended load of a subsonic table. */
  loads: Array<{ name: 'start' | 'maximum' | 'recommended'; load: ManualLoad }>;
  /** Page number in the PDF, from 1, and the column. */
  page: number;
  column: 'left' | 'right';
}

export interface ManualLoad {
  charge: number;
  compressed: boolean;
  velocity: number;
  pressure: number;
  unit: 'PSI' | 'CUP';
}

const LOAD = String.raw`(\d+\.\d)(C?\*?)\s+(\d{3,5})\s+(\d{1,3}(?:,\d{3})?)\s+(PSI|CUP)`;
const ROW = new RegExp(String.raw`^(\S.*?)\s+${LOAD}\s+${LOAD}$`);
/** A subsonic table's row: one recommended load. */
const SINGLE = new RegExp(String.raw`^(\S.*?)\s+${LOAD}$`);
/** A line that looks like a row: a name, then a charge, a velocity and a pressure unit. */
const ROW_LIKE = /\d+\.\d\S*\s+\d{3,5}\s+[\d,]+\s+(?:PSI|CUP)/;
const BARREL = /^Barrel:\s*(\S+)\s+Twist:\s*(\S+)/;
const BULLET = /^Bullet:\s*((\d+)\s+GR\..*?)\s+Dia:\s*([.\d]+)/;
const CASE = /^Case:\s*(.*?)\s+Primer:.*?Col:\s*([.\d]+)/i;

/** Each page's two columns, left then right, cut at the page's second `Powder` heading. */
export function columns(text: string): Array<{ page: number; column: 'left' | 'right'; lines: string[] }> {
  const result: Array<{ page: number; column: 'left' | 'right'; lines: string[] }> = [];
  text.split('\f').forEach((page, index) => {
    const lines = page.split('\n');
    const header = lines.find((line) => (line.match(/\bPowder\b/g) ?? []).length >= 2);
    if (header === undefined) return;
    const cut = header.indexOf('Powder', header.indexOf('Powder') + 1);
    result.push({ page: index + 1, column: 'left', lines: lines.map((line) => line.slice(0, cut).trim()) });
    result.push({ page: index + 1, column: 'right', lines: lines.map((line) => line.slice(cut).trim()) });
  });
  return result;
}

/** Every complete row of the manual's tables; a line that looks like a row but can't be read is listed. */
export function readManualRows(text: string): { rows: ManualRow[]; unread: string[] } {
  const rows: ManualRow[] = [];
  const unread: string[] = [];
  const state = { cartridge: '', barrel: '', twist: '', bullet: '', mass: 0, diameter: 0, caseMake: '', overallLength: 0 };
  for (const { page, column, lines } of columns(text)) {
    lines.forEach((line, index) => {
      const barrel = BARREL.exec(line);
      if (barrel) {
        // The cartridge's name is the nearest line above its barrel, printed in small capitals
        // (`22 hoRnet`); a blank line may stand between them.
        const name = lines.slice(Math.max(0, index - 3), index).reverse().find((above) => above !== '') ?? '';
        state.cartridge = name.toUpperCase().replace(/\s+/g, ' ').trim();
        state.barrel = barrel[1]!;
        state.twist = barrel[2]!;
        return;
      }
      const bullet = BULLET.exec(line);
      if (bullet) {
        state.bullet = bullet[1]!.replace(/\s+/g, ' ');
        state.mass = Number(bullet[2]);
        state.diameter = Number(bullet[3]);
        return;
      }
      const caseLine = CASE.exec(line);
      if (caseLine) {
        state.caseMake = caseLine[1]!.trim();
        state.overallLength = Number(caseLine[2]);
        return;
      }
      const pair = ROW.exec(line);
      const match = pair ?? SINGLE.exec(line);
      if (!match || !state.cartridge || !state.bullet || !state.overallLength) {
        if (ROW_LIKE.test(line) && !/Grs\s+Vel/.test(line)) unread.push(`page ${page} ${column}: ${line}`);
        return;
      }
      const load = (offset: number): ManualLoad => ({
        charge: Number(match[offset]),
        compressed: match[offset + 1]!.startsWith('C'),
        velocity: Number(match[offset + 2]),
        pressure: Number(match[offset + 3]!.replace(/,/g, '')),
        unit: match[offset + 4] as 'PSI' | 'CUP',
      });
      const loads: ManualRow['loads'] = pair
        ? [{ name: 'start', load: load(2) }, { name: 'maximum', load: load(7) }]
        : [{ name: 'recommended', load: load(2) }];
      rows.push({ ...state, powder: match[1]!.trim(), loads, page, column });
    });
  }
  return { rows, unread };
}

/**
 * The manual's powder names as the component pool names the models: the pool holds `H380 #3` and, for
 * Lil'Gun, a subsonic model and a general one (`Lil' Gun QL`); the manual's loads are full-power, so
 * the general one. Others keep their maker by the manual's own grouping.
 */
const POWDERS: Record<string, { maker: string; product: string }> = {
  'StaBALL Match': { maker: 'Winchester', product: 'StaBALL Match' },
  H380: { maker: 'Hodgdon', product: 'H380 #3' },
  'Lil’Gun': { maker: 'Hodgdon', product: "Lil' Gun QL" },
  H50BMG: { maker: 'Hodgdon', product: '50BMG' },
};

function powderOf(name: string): { maker: string; product: string } {
  return POWDERS[name] ?? { maker: 'Hodgdon', product: name };
}

/**
 * The manual's cartridges whose caliber definition the community pool holds, by the case the table
 * names where the pool has a definition per case (`.308 Win. Hornady`).
 */
function caliberOf(cartridge: string, caseMake: string): string {
  if (cartridge === '308 WINCHESTER') {
    const byCase: Record<string, string> = { Winchester: '.308 Win. Winchester', Hornady: '.308 Win. Hornady', Federal: '.308 Win. Federal' };
    return byCase[caseMake] ?? `308 WINCHESTER (${caseMake} case)`;
  }
  return CALIBERS[cartridge] ?? cartridge;
}

const CALIBERS: Record<string, string> = {
  '300 WINCHESTER SHORT MAGNUM': '.300 WSM Winchester Brand',
  '30 NOSLER': '.30 Nosler',
  '26 NOSLER': '.26 Nosler',
  '300 PRC': '.300 PRC Corrected',
  '7MM PRC': '7 PRC',
  '6.8 WESTERN': '6.8 Western',
  '6MM ARC': '6 mm ARC',
  '25 CREEDMOOR': '25 Creedmoor',
  '400 LEGEND': '400 Legend',
  '327 FEDERAL MAGNUM': '.327 Fed Magnum',
  '8.6 BLACKOUT': '8.6 Blackout',
  '22 GT': '.22 GT',
  '6 GT': '6 mm GT',
  '22 TCM': '.22 TCM',
  '30 SUPER CARRY': '30 Super Carry',
};

/** A barrel or twist as printed, `24”` or `1:16”`, in metres. */
function inches(text: string): number | undefined {
  const value = Number(/([\d.]+)”?$/.exec(text.replace(/^1:/, ''))?.[1]);
  return Number.isFinite(value) && value > 0 ? value * units.INCH : undefined;
}

/** The start and the maximum load of every row, each a condition of the bullet and powder's series. */
export function hodgdonManualConditions(text: string): { conditions: PressureCondition[]; unread: string[] } {
  const { rows, unread } = readManualRows(text);
  const conditions: PressureCondition[] = [];
  const source = HODGDON_MANUAL_2025_SOURCE.id;
  for (const row of rows) {
    const construction: ProjectileConstruction = /\b(GMX|E-TIP|TTSX|TSX|LRX|CX|VG)\b/.test(row.bullet) ? 'rifle-solid-copper' : 'rifle-jacketed';
    const barrel = inches(row.barrel);
    const twist = inches(row.twist);
    const series = `${source}/${row.cartridge}/${row.bullet}/${row.caseMake}/${row.powder}`;
    for (const { name, load } of row.loads) {
      conditions.push({
        id: `${source}/p${row.page}${row.column[0]}/${row.bullet}/${row.powder}/${name}`,
        source,
        location: `page ${row.page}, ${row.column} column, ${name} load`,
        series,
        caliber: caliberOf(row.cartridge, row.caseMake),
        powder: powderOf(row.powder),
        projectile: {
          name: row.bullet,
          mass: input(row.mass * units.GRAIN, 'published', `${row.mass} gr`),
          key: PROJECTILES[`${row.diameter} ${row.bullet}`] ?? `${row.bullet} (.${String(row.diameter).replace(/^0?\./, '')})`,
          construction,
        },
        charge: input(load.charge * units.GRAIN, 'published', `${load.charge} gr${load.compressed ? ', compressed' : ''}`),
        overallLength: input(row.overallLength * units.INCH, 'published', `${row.overallLength}"`),
        barrelLength: barrel ? input(barrel, 'published', row.barrel) : input(0, 'assumed', 'barrel not read'),
        ...(twist ? { twistLength: input(twist, 'published', row.twist) } : {}),
        ...(load.unit === 'PSI' ? { pressure: input(load.pressure * units.PSI, 'published', `${load.pressure} psi`) } : {}),
        velocity: input(load.velocity * units.FOOT_PER_SECOND, 'published', `${load.velocity} ft/s`),
        // The community models name no derivation; whether one was fitted to Hodgdon's data is unknown.
        fitting: 'unknown',
        note: `case: ${row.caseMake}${load.unit === 'CUP' ? '; pressure in CUP, not used' : ''}`,
      });
    }
  }
  return { conditions, unread };
}

/**
 * The manual's bullets that the specification table holds, by diameter and printed name. Only bullets
 * whose identity is plain are mapped: Hornady's 80 gr 6mm GMX, which retailers now list only as its
 * successor the CX, and Sierra's 70 gr 6mm BlitzKing, which they list under another part, are not.
 */
const PROJECTILES: Record<string, string> = {
  '0.224 40 GR. NOS B-TIP': 'nosler-ballistic-tip-40-224',
  '0.224 53 GR. HDY V-MAX': 'hornady-v-max-53-224',
  '0.224 55 GR. SIE BK': 'sierra-blitzking-55-224',
  '0.243 70 GR. SPR HP': 'speer-tnt-70-243',
  '0.243 95 GR. SIE TMK': 'sierra-tmk-95-243',
  '0.243 100 GR. NOS PART': 'nosler-partition-100-243',
  '0.243 110 GR. HDY A-TIP': 'hornady-a-tip-110-243',
  '0.243 55 GR. NOS B-TIP': 'nosler-ballistic-tip-55-243',
  '0.243 100 GR. SIE SBT': 'sierra-gameking-100-243-sbt',
  '0.308 130 GR. SPR HP': 'speer-varmint-hp-130',
  '0.308 150 GR. NOS BT': 'nosler-ballistic-tip-150',
  '0.308 165 GR. HDY SP': 'hornady-sp-165',
  '0.308 168 GR. SIE HPBT': 'sierra-matchking-168',
  '0.308 175 GR. SIE HPBT': 'sierra-matchking-175',
  '0.308 165 GR. NOS PART': 'nosler-partition-165',
  '0.308 208 GR. HDY ELD-M': 'hornady-eld-match-208',
  '0.308 155 GR. SIE HPBT': 'sierra-matchking-155-palma',
  '0.243 95 GR. BAR BT LRX': 'barnes-lrx-95-243',
  '0.243 65 GR. HDY V-MAX': 'hornady-v-max-65-243',
};
