/**
 * Varies one GRT input at a time around a base load and records GRT's results, to study how GRT's
 * model responds. Needs GRT running with the capture plugin (run.sh does it).
 *
 *     node sweep.ts [--fields MaxPressure,MuzzleVelocity] [--out sweep.json] <base.grtload> <name>=<v1>,<v2>... ...
 *
 * `name` is an `<input>` or `<config>` entry of the load, such as `Ba`, `mc` or `CurveFocusIdx`. Each
 * entry is swept on its own, the others keeping their base values. Prints a tab-separated table of the
 * requested result fields; `--out` also saves every result and curve as JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { BRIDGE_PORT } from './bridge.ts';
import { GrtIpcClient } from './grt-ipc-client.ts';
import { setGrtValue, simulateInGrt, type GrtSimulation } from './simulate.ts';

const DEFAULT_FIELDS = ['MaxPressure', 'MuzzleVelocity', 'MuzzleTime', 'Eprop', 'z'];

interface SweepPoint extends GrtSimulation {
  input: string;
  value: string;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: { fields: { type: 'string' }, out: { type: 'string' } },
    allowPositionals: true,
  });
  const [basePath, ...settings] = positionals;
  if (basePath === undefined || settings.length === 0) {
    console.error('Usage: node sweep.ts [--fields a,b] [--out file.json] <base.grtload> <name>=<v1>,<v2>... ...');
    process.exit(2);
  }
  const fields = values.fields?.split(',') ?? DEFAULT_FIELDS;
  const base = readFileSync(basePath, 'utf8');
  const name = basename(basePath, '.grtload').replace(/[^\w.-]/g, '_');

  const client = await GrtIpcClient.connect(BRIDGE_PORT);
  const points: SweepPoint[] = [];
  console.log(['input', 'value', ...fields].join('\t'));
  try {
    for (const setting of settings) {
      const [input, list] = setting.split('=');
      if (input === undefined || list === undefined) throw new Error(`Expected name=v1,v2…, got "${setting}"`);
      for (const value of list.split(',')) {
        const simulation = await simulateInGrt(client, setGrtValue(base, input, value), `${name}-${input}`);
        points.push({ input, value, ...simulation });
        console.log([input, value, ...fields.map((field) => simulation.results[field] ?? '')].join('\t'));
      }
    }
  } finally {
    client.close();
  }
  if (values.out !== undefined) writeFileSync(values.out, `${JSON.stringify({ base: basename(basePath), points })}\n`);
}

if (import.meta.main) await main();
