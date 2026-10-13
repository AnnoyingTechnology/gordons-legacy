/**
 * Captures GRT's simulation results for load files, as reference data for Gordon's Legacy's engine.
 * Needs GRT running with the capture plugin (see README.md; run.sh does everything).
 *
 *     node capture.ts --out <directory> <file.grtload>...
 *
 * Writes one `<name>.json` per load: GRT's scalar results verbatim, and its curve as numbers in GRT's
 * units. Each load is simulated from a working copy with the ladder disabled and the first curve
 * selected, so that the results are those of the load's own charge.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BRIDGE_PORT } from './bridge.ts';
import { GrtIpcClient, type GrtCurvePoint } from './grt-ipc-client.ts';
import { simulateInGrt } from './simulate.ts';
/** Significant digits kept in curves: far below any comparison tolerance, and keeps files small. */
const CURVE_DIGITS = 10;

/** Reference data for one load, as written to disk. */
export interface GrtReference {
  /** File name of the simulated load. */
  source: string;
  /** GRT version that produced the data. */
  grtVersion: string;
  /** Capture date, ISO `YYYY-MM-DD`. */
  capturedOn: string;
  /** Changes made to the load before simulating it. */
  changes: string[];
  /** `Get_TabResults` data, verbatim: values with their GRT unit, for example `"1961.52 bar"`. */
  results: Record<string, string>;
  /** The simulated curve, one array per quantity, uniform in projectile travel. */
  curve: {
    position_mm: number[];
    burntFraction: number[];
    pressure_bar: number[];
    velocity_m_s: number[];
    projectileEnergy_J: number[];
    time_ms: number[];
  };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true });
  if (values.out === undefined || positionals.length === 0) {
    console.error('Usage: node capture.ts --out <directory> <file.grtload>...');
    process.exit(2);
  }
  mkdirSync(values.out, { recursive: true });

  const client = await GrtIpcClient.connect(BRIDGE_PORT);
  let failures = 0;
  try {
    for (const path of positionals) {
      try {
        const reference = await captureLoad(client, resolve(path));
        const output = join(values.out, `${basename(path, '.grtload')}.json`);
        writeFileSync(output, `${JSON.stringify(reference)}\n`);
        console.log(`${basename(path)}: Pmax ${reference.results['MaxPressure']}, v0 ${reference.results['MuzzleVelocity']}`);
      } catch (error) {
        failures++;
        console.error(`${basename(path)}: ${(error as Error).message}`);
      }
    }
  } finally {
    client.close();
  }
  process.exit(failures === 0 ? 0 : 1);
}

async function captureLoad(client: GrtIpcClient, path: string): Promise<GrtReference> {
  const original = readFileSync(path, 'utf8');
  const { text, changes } = prepareForCapture(original);
  const { results, curve } = await simulateInGrt(client, text, basename(path, '.grtload'));

  return {
    source: basename(path),
    grtVersion: /version='([^']*)'/.exec(original)?.[1] ?? 'unknown',
    capturedOn: new Date().toISOString().slice(0, 10),
    changes,
    results,
    curve: toColumns(curve),
  };
}

/** Disables the ladder and selects the first curve, so that GRT reports the load's own charge. */
function prepareForCapture(text: string): { text: string; changes: string[] } {
  const changes: string[] = [];
  let prepared = text.replace(/(name="laddercnt" value=")([^"]*)"/, (match, prefix: string, steps: string) => {
    if (Number(steps) < 2) return match;
    changes.push(`ladder disabled (laddercnt ${steps} → 1)`);
    return `${prefix}1"`;
  });
  prepared = prepared.replace(/(name="CurveFocusIdx" value=")([^"]*)"/, (match, prefix: string, index: string) => {
    if (index === '0') return match;
    changes.push(`first curve selected (CurveFocusIdx ${index} → 0)`);
    return `${prefix}0"`;
  });
  return { text: prepared, changes };
}

function toColumns(points: GrtCurvePoint[]): GrtReference['curve'] {
  const column = (key: keyof GrtCurvePoint) => points.map((point) => Number(Number(point[key]).toPrecision(CURVE_DIGITS)));
  return {
    position_mm: column('x'),
    burntFraction: column('z'),
    pressure_bar: column('p'),
    velocity_m_s: column('v'),
    projectileEnergy_J: column('e'),
    time_ms: column('t'),
  };
}

if (import.meta.main) await main();
