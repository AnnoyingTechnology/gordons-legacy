/**
 * Hodgdon's Subsonic Rifle Load Data sheet: for each cartridge, bullet and powder, a maximum charge
 * (and sometimes a start charge) with its velocity and its pressure, the pressure followed by `PSI`,
 * `CUP` or `N/A`.
 *
 * As on Hodgdon's M1 Garand sheet (`hodgdon-m1-garand.ts`), the method is not stated: `PSI` and `CUP`
 * follow the trade's convention, CUP is never converted, and the test barrel, case, temperature and
 * shot count are not given. The .300 AAC Blackout barrel is assumed to be 16″.
 *
 * Only the .300 AAC Blackout rows are turned into conditions: the other cartridges' rows use powders
 * (Trail Boss, H322, BM2, H4895) we hold no model of, or give CUP.
 */
import { units } from '@gordons-legacy/formats';
import { input, type PressureCondition, type PressureSource } from '../conditions.ts';

export const HODGDON_SUBSONIC_SOURCE: PressureSource = {
  id: 'hodgdon-subsonic',
  title: 'Subsonic Rifle Load Data',
  publisher: 'Hodgdon Powder Company',
  laboratory: 'Hodgdon (not stated further)',
  url: 'https://hodgdonpowderco.com/wp-content/uploads/2023/04/subsonic-data-final-1.pdf',
  sha256: '2d4b96f758d6fb11496ecc31c8a8e1fe4f74fd798e8a290eeb2f6eb71e8041f8',
  method: 'not-stated',
  quantity: 'not-stated',
  methodNote: 'Each pressure is followed by "PSI", "CUP" or "N/A"; no method, barrel, case, temperature or shot count is stated.',
};

/** One charge of a row: grains, ft/s, and the pressure with its unit (none for `N/A`). */
export interface SubsonicCharge {
  charge: number;
  compressed: boolean;
  velocity: number;
  pressure?: { value: number; unit: 'PSI' | 'CUP' };
}

export interface SubsonicRow {
  cartridge: string;
  bullet: string;
  maker: string;
  powder: string;
  overallLength: number;
  start?: SubsonicCharge;
  maximum: SubsonicCharge;
  line: number;
}

const CHARGE = String.raw`(\d+(?:\.\d)?)(\s*C)?\s+(\d{0,1},?\d{3})\s+(?:([\d,]+)\s+(PSI|CUP)|N\/A)`;
const ROW = new RegExp(
  String.raw`^\s*(?<cartridge>\S.*?)\s{2,}(?<bullet>\d{2,3} GR .+?)\s{2,}(?<maker>Hodgdon|IMR|Winchester)\s+(?<powder>\S.*?)\s+\.\d{3}"\s+(?<length>\d\.\d{3})"\s+(?<charges>.+?)\s*$`,
);

function chargesOf(text: string): SubsonicCharge[] {
  return [...text.matchAll(new RegExp(CHARGE, 'g'))].map((match) => ({
    charge: Number(match[1]),
    compressed: match[2] !== undefined,
    velocity: Number(match[3]!.replace(/,/g, '')),
    ...(match[4] ? { pressure: { value: Number(match[4].replace(/,/g, '')), unit: match[5] as 'PSI' | 'CUP' } } : {}),
  }));
}

/** Reads the rows from `pdftotext -layout` output; a row-like line that can't be read is listed. */
export function readSubsonicRows(text: string): { rows: SubsonicRow[]; unread: string[] } {
  const rows: SubsonicRow[] = [];
  const unread: string[] = [];
  text.split('\n').forEach((line, index) => {
    const groups = ROW.exec(line)?.groups;
    const charges = groups ? chargesOf(groups.charges!) : [];
    if (!groups || charges.length === 0 || charges.length > 2) {
      if (/\d{2,3} GR /.test(line)) unread.push(`line ${index + 1}: ${line.trim()}`);
      return;
    }
    rows.push({
      cartridge: groups.cartridge!.trim(),
      bullet: groups.bullet!.trim(),
      maker: groups.maker!,
      powder: groups.powder!.trim(),
      overallLength: Number(groups.length),
      ...(charges.length === 2 ? { start: charges[0]! } : {}),
      maximum: charges[charges.length - 1]!,
      line: index + 1,
    });
  });
  return { rows, unread };
}

/** The sheet's bullets that the specification table holds a length for. */
const PROJECTILES: Record<string, string> = {
  '190 GR HDY SUB-X': 'hornady-sub-x-190',
  '208 GR HDY A-MAX': 'hornady-a-max-208',
  '220 GR SIE HPBT': 'sierra-matchking-220',
  '230 GR BER TACT': 'berger-30112',
};

const CALIBERS: Record<string, string> = { '300 Blackout': '.300 AAC Blackout' };

export function subsonicConditions(text: string): { conditions: PressureCondition[]; unread: string[] } {
  const { rows, unread } = readSubsonicRows(text);
  const conditions: PressureCondition[] = [];
  for (const row of rows.filter((candidate) => CALIBERS[candidate.cartridge] !== undefined)) {
    const series = `${HODGDON_SUBSONIC_SOURCE.id}/${row.cartridge}/${row.bullet}/${row.powder}`;
    const loads: Array<['start' | 'maximum', SubsonicCharge]> = row.start ? [['start', row.start], ['maximum', row.maximum]] : [['maximum', row.maximum]];
    for (const [name, load] of loads) {
      conditions.push({
        id: `${HODGDON_SUBSONIC_SOURCE.id}/l${row.line}/${name}`,
        source: HODGDON_SUBSONIC_SOURCE.id,
        location: `text line ${row.line}, ${name} load`,
        series,
        caliber: CALIBERS[row.cartridge]!,
        // The maker column repeats itself in the product's name: `IMR`, `IMR 4198`.
        powder: { maker: row.maker, product: row.powder.replace(new RegExp(`^${row.maker}\\s+`), '') },
        projectile: {
          name: row.bullet,
          mass: input(Number(/^\d+/.exec(row.bullet)![0]) * units.GRAIN, 'published', row.bullet),
          key: PROJECTILES[row.bullet] ?? row.bullet,
          construction: 'rifle-jacketed',
        },
        charge: input(load.charge * units.GRAIN, 'published', `${load.charge} gr${load.compressed ? ' C' : ''}`),
        overallLength: input(row.overallLength * units.INCH, 'published', `${row.overallLength}"`),
        barrelLength: input(16 * units.INCH, 'assumed', '16 in, assumed; the sheet names no barrel'),
        ...(load.pressure?.unit === 'PSI' ? { pressure: input(load.pressure.value * units.PSI, 'published', `${load.pressure.value} psi`) } : {}),
        velocity: input(load.velocity * units.FOOT_PER_SECOND, 'published', `${load.velocity} ft/s`),
        fitting: 'unknown',
        ...(load.compressed ? { note: 'compressed load' } : {}),
      });
    }
  }
  return { conditions, unread };
}
