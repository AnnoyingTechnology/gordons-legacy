/**
 * Hodgdon's M1 Garand Service Rifle Load Data sheet (.30-06 kept below full-power pressures for the
 * Garand's gas system): for each bullet and powder, a start and a maximum charge, each with its velocity
 * and pressure, the pressure's column saying `PSI` or `CUP`.
 *
 * The sheet does not state its method. Its `PSI/CUP` column follows the trade's convention that psi
 * comes from a piezoelectric transducer and CUP from a copper crusher, but that is a convention, not a
 * statement, so the method is recorded as not stated. CUP rows keep their velocity and lose their
 * pressure: CUP is not a pressure and is never converted. Nor does the sheet name the test barrel, the
 * case or the temperature; the barrel is assumed to be Hodgdon's usual 24″ for the .30-06.
 *
 * The conditions are read from the PDF the user downloaded, checked by its SHA-256.
 */
import { units } from '@gordons-legacy/formats';
import { input, type PressureCondition, type PressureSource, type ProjectileConstruction } from '../conditions.ts';

export const HODGDON_M1_SOURCE: PressureSource = {
  id: 'hodgdon-m1-garand',
  title: 'M1 Garand Service Rifle Load Data',
  publisher: 'Hodgdon Powder Company',
  laboratory: 'Hodgdon (not stated further)',
  url: 'https://hodgdonpowderco.com/wp-content/uploads/2023/04/m1-final-data-1.pdf',
  sha256: 'f19c79d874da1e2f259fb3b4338437a4bfa256bc3cf7b97107f99036f7c6f238',
  method: 'not-stated',
  quantity: 'not-stated',
  methodNote:
    'Column "PSI/CUP" beside each pressure: by the trade\'s convention psi rows are piezoelectric and CUP rows copper crusher, ' +
    'but the sheet states no method, barrel, case, temperature or shot count.',
};

/** One row of the sheet. */
export interface HodgdonRow {
  bullet: string;
  mass: number;
  powder: string;
  overallLength: number;
  start: { charge: number; velocity: number; pressure: number; unit: 'PSI' | 'CUP' };
  maximum: { charge: number; velocity: number; pressure: number; unit: 'PSI' | 'CUP' };
  line: number;
}

const ROW =
  /^\s*(?<bullet>\d{3} GR\. .+?)\s{2,}(?<mass>\d{3})\s+(?<powder>\S.*?)\s+\.308"\s+(?<length>\d\.\d{3})"\s+(?<startCharge>\d+\.\d)\s+(?<startVelocity>\d,\d{3})\s+(?<startPressure>\d{2},\d{3})\s+(?<startUnit>PSI|CUP)\s+(?<maxCharge>\d+\.\d)\s+(?<maxVelocity>\d,\d{3})\s+(?<maxPressure>\d{2},\d{3})\s+(?<maxUnit>PSI|CUP)\s*$/;

/** A line that looks like a row: it starts with a bullet weight in grains. */
const ROW_LIKE = /^\s*\d{3} GR\./;

/** Reads the rows from `pdftotext -layout` output; a row-like line that can't be read is listed. */
export function readHodgdonRows(text: string): { rows: HodgdonRow[]; unread: string[] } {
  const rows: HodgdonRow[] = [];
  const unread: string[] = [];
  text.split('\n').forEach((line, index) => {
    const groups = ROW.exec(line)?.groups;
    if (!groups) {
      if (ROW_LIKE.test(line)) unread.push(`line ${index + 1}: ${line.trim()}`);
      return;
    }
    const number = (text: string) => Number(text.replace(/,/g, ''));
    rows.push({
      bullet: groups.bullet!.trim(),
      mass: number(groups.mass!),
      powder: groups.powder!.trim(),
      overallLength: number(groups.length!),
      start: { charge: number(groups.startCharge!), velocity: number(groups.startVelocity!), pressure: number(groups.startPressure!), unit: groups.startUnit as 'PSI' | 'CUP' },
      maximum: { charge: number(groups.maxCharge!), velocity: number(groups.maxVelocity!), pressure: number(groups.maxPressure!), unit: groups.maxUnit as 'PSI' | 'CUP' },
      line: index + 1,
    });
  });
  return { rows, unread };
}

/** The sheet's bullets that the specification table holds a length for. */
const PROJECTILES: Record<string, string> = {
  '150 GR. NOS BT': 'nosler-ballistic-tip-150',
  '150 GR. NOS E-TIP': 'nosler-e-tip-150',
  '165 GR. HDY GMX': 'hornady-gmx-165',
  '165 GR. SIE SPBT': 'sierra-gameking-165-sbt',
  '168 GR. HDY HPBT': 'hornady-match-168',
  '175 GR. SIE HPBT': 'sierra-matchking-175',
  '180 GR. SIE SPBT': 'sierra-gameking-180-sbt',
  // `155 GR. SIE HPBT` is either Palma MatchKing, the 2155 (1.119″) or the 2156 (1.219″): not chosen.
};

/** The sheet's powder names as maker and product: Hodgdon distributes IMR's and Winchester's too. */
function powderOf(name: string): { maker: string; product: string } {
  const imr = /^IMR\s+(.+)$/.exec(name);
  if (imr) return { maker: 'IMR', product: imr[1]! };
  if (name === '748') return { maker: 'Winchester', product: '748' };
  return { maker: 'Hodgdon', product: name };
}

/**
 * Possible fitting overlap: with the reconstructed inputs, both 165 gr GMX pressures agree with the
 * published values within 0.03 % (2026-11-02), when every other bullet is 13–22 % under. Calibration
 * provenance has not been established — the endpoints are correlated, the published figures rounded,
 * and the agreement depends on assumed geometry and shot-start pressure — so these rows are set apart
 * as suspected, not excluded as known, and the report shows the comparison with and without them. The
 * sheet's other rows share its publication; their independence from the model's fit is unresolved.
 */
function fittedTo(row: HodgdonRow): boolean {
  return row.bullet === '165 GR. HDY GMX' && row.powder === 'IMR 4166';
}

/** The start and maximum loads, with their pressure when it is in psi. */
export function hodgdonConditions(text: string): { conditions: PressureCondition[]; unread: string[] } {
  const { rows, unread } = readHodgdonRows(text);
  const conditions: PressureCondition[] = [];
  for (const row of rows) {
    const construction: ProjectileConstruction = /GMX|E-TIP/.test(row.bullet) ? 'rifle-solid-copper' : 'rifle-jacketed';
    const series = `${HODGDON_M1_SOURCE.id}/${row.bullet}/${row.powder}`;
    for (const [name, load] of [
      ['start', row.start],
      ['maximum', row.maximum],
    ] as const) {
      conditions.push({
        id: `${HODGDON_M1_SOURCE.id}/l${row.line}/${name}`,
        source: HODGDON_M1_SOURCE.id,
        location: `text line ${row.line}, ${name} load`,
        series,
        caliber: '.30-06 Spring. HXP 77',
        powder: powderOf(row.powder),
        projectile: {
          name: row.bullet,
          mass: input(row.mass * units.GRAIN, 'published', `${row.mass} gr`),
          key: PROJECTILES[row.bullet] ?? row.bullet,
          construction,
        },
        charge: input(load.charge * units.GRAIN, 'published', `${load.charge} gr`),
        overallLength: input(row.overallLength * units.INCH, 'published', `${row.overallLength}"`),
        barrelLength: input(24 * units.INCH, 'assumed', "24 in, Hodgdon's usual .30-06 test barrel; the sheet names none"),
        ...(load.unit === 'PSI' ? { pressure: input(load.pressure * units.PSI, 'published', `${load.pressure} psi`) } : {}),
        velocity: input(load.velocity * units.FOOT_PER_SECOND, 'published', `${load.velocity} ft/s`),
        fitting: fittedTo(row) ? 'suspected-overlap' : 'unknown',
        note: `caliber definition: the .30-06 of GRT's IMR 4166 workup files, an HXP case; the sheet names no case${load.unit === 'CUP' ? '; pressure in CUP, not used' : ''}`,
      });
    }
  }
  return { conditions, unread };
}
