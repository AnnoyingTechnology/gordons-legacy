/**
 * Compares the engines' peak pressures with pressures published by powder makers (issue #22). Velocity
 * agreement alone never qualifies an engine: a model can match velocities with pressures that are too
 * low, which is the dangerous direction. This is the only check that can qualify them.
 *
 *     node tools/validation/pressure.ts <rows.csv> [--engine research-1]
 *
 * The CSV holds one published load a row. Its columns, in this order, with a header line:
 *
 *     cartridge,powder,bulletMass,bulletName,coal,charge,barrel,velocity,pressure,standard,source
 *
 * | Column | Unit | Meaning |
 * |---|---|---|
 * | `cartridge` | | As the caliber file names it, or any name that contains it: `.308 Win`, `9 mm Luger`. |
 * | `powder` | | Maker and product as our corpus names them: `Hodgdon H380 #3`. |
 * | `bulletMass` | grains | |
 * | `bulletName` | | Optional; a projectile of the corpus whose name contains it, else one is chosen by mass and diameter. |
 * | `coal` | inches | Cartridge overall length the table gives. |
 * | `charge` | grains | |
 * | `barrel` | inches | The test barrel's length. |
 * | `velocity` | ft/s | The published velocity. |
 * | `pressure` | psi or CUP | The published pressure. |
 * | `standard` | | `psi` or `cup`; CUP rows are reported apart, since CUP does not convert to psi. |
 * | `source` | | Where the row comes from: maker, edition, page. |
 *
 * Every row is simulated from the caliber definition of our corpus, with the published powder, a
 * projectile of that mass, the published overall length, charge and barrel. What the table does not
 * give — the case capacity above all — comes from the caliber file, so a few percent of error is in
 * the comparison before the engine is asked anything. Rows whose parts we don't have are listed as
 * skipped rather than guessed at.
 */
import { readFileSync } from 'node:fs';
import { grtTraditional, researchEngine, type Engine } from '@gordons-legacy/engine';
import { checkCaliber, checkProjectile, checkPropellant, units, type CaliberDefinition, type Load, type Projectile, type Propellant } from '@gordons-legacy/formats';

const SNAPSHOT = new URL('../../packages/app/src/data/community-components.json', import.meta.url);

interface PublishedRow {
  cartridge: string;
  powder: string;
  /** kg. */
  bulletMass: number;
  bulletName: string;
  /** m. */
  overallLength: number;
  /** kg. */
  charge: number;
  /** m. */
  barrel: number;
  /** m/s. */
  velocity: number;
  /** Pa for psi rows; CUP is not a pressure unit and is kept as published. */
  pressure: number;
  standard: 'psi' | 'cup';
  source: string;
}

interface Comparison {
  row: PublishedRow;
  simulatedPressure: number;
  simulatedVelocity: number;
}

/** The community corpus, as the app bundles it. */
function corpus(): { calibers: CaliberDefinition[]; projectiles: Projectile[]; powders: Propellant[] } {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
    calibers: Array<{ caliber: unknown }>;
    projectiles: Array<{ projectile: unknown }>;
    powders: Array<{ propellant: unknown }>;
  };
  const kept = <T>(values: unknown[], check: (value: unknown) => { ok: boolean; value?: T }): T[] =>
    values.flatMap((value) => {
      const result = check(value);
      return result.ok && result.value ? [result.value] : [];
    });
  return {
    calibers: kept(snapshot.calibers.map((entry) => entry.caliber), checkCaliber),
    projectiles: kept(snapshot.projectiles.map((entry) => entry.projectile), checkProjectile),
    powders: kept(snapshot.powders.map((entry) => entry.propellant), checkPropellant),
  };
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function readRows(csv: string): PublishedRow[] {
  const lines = csv.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
  const rows: PublishedRow[] = [];
  for (const line of lines.slice(1)) {
    const [cartridge, powder, bulletMass, bulletName, coal, charge, barrel, velocity, pressure, standard, ...source] = line.split(',').map((cell) => cell.trim());
    if (!cartridge || !powder || !charge || !pressure) continue;
    rows.push({
      cartridge,
      powder,
      bulletMass: Number(bulletMass) * units.GRAIN,
      bulletName: bulletName ?? '',
      overallLength: Number(coal) * units.INCH,
      charge: Number(charge) * units.GRAIN,
      barrel: Number(barrel) * units.INCH,
      velocity: Number(velocity) * units.FOOT_PER_SECOND,
      pressure: standard === 'cup' ? Number(pressure) : Number(pressure) * units.PSI,
      standard: standard === 'cup' ? 'cup' : 'psi',
      source: source.join(','),
    });
  }
  return rows;
}

/** The load a published row describes, as far as our data can describe it. */
export function loadFor(row: PublishedRow, parts = corpus()): Load | { missing: string } {
  const caliber = parts.calibers.find((candidate) => normalise(`${candidate.name} ${candidate.alternativeNames}`).includes(normalise(row.cartridge)));
  if (!caliber) return { missing: `no caliber file for ${row.cartridge}` };
  const powder = parts.powders.find((candidate) => normalise(`${candidate.maker} ${candidate.product}`) === normalise(row.powder));
  if (!powder) return { missing: `no powder model for ${row.powder}` };
  const diameter = caliber.rifling?.grooveDiameter ?? 0;
  const named = row.bulletName === '' ? undefined : parts.projectiles.find((candidate) => normalise(candidate.name).includes(normalise(row.bulletName)));
  const byMass = parts.projectiles
    .filter((candidate) => Math.abs(candidate.diameter - diameter) < 0.0002)
    .sort((a, b) => Math.abs(a.mass - row.bulletMass) - Math.abs(b.mass - row.bulletMass))[0];
  const projectile = named ?? byMass;
  if (!projectile) return { missing: `no projectile of ${(row.bulletMass / units.GRAIN).toFixed(0)} gr at ${(diameter * 1000).toFixed(2)} mm` };
  if (!caliber.caseDimensions || !caliber.rifling || !caliber.typicalCaseCapacity) return { missing: `caliber ${caliber.name} lacks its dimensions` };
  return {
    format: 'gordons-legacy.load',
    schemaVersion: 1,
    title: `${row.cartridge} · ${row.powder}`,
    cartridge: {
      name: caliber.name,
      grooveDiameter: caliber.rifling.grooveDiameter,
      effectiveBoreArea: caliber.rifling.effectiveBoreArea,
      maxPressure: caliber.maxPressure,
      pressureMeasurementMethod: '',
      caseLength: caliber.caseDimensions.caseLength,
      caseCapacity: caliber.typicalCaseCapacity,
      overallLength: row.overallLength,
      sebertFactor: caliber.sebertFactor,
      shotshell: false,
      definition: caliber,
    },
    barrel: { name: 'test barrel', length: row.barrel, gasLeaks: [] },
    // The published bullet's mass, with the shape of the nearest one we have.
    projectile: { ...projectile, mass: row.bulletMass },
    propellant: powder,
    charge: { mass: row.charge, temperature: 294.15 },
    measurements: [],
    notes: [],
    pictures: [],
  };
}

export function compare(rows: PublishedRow[], engine: Engine = grtTraditional): { comparisons: Comparison[]; skipped: string[] } {
  const parts = corpus();
  const comparisons: Comparison[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const load = loadFor(row, parts);
    if ('missing' in load) {
      skipped.push(`${row.cartridge} · ${row.powder}: ${load.missing}`);
      continue;
    }
    const result = engine.simulate(load);
    if (!result.ok) {
      skipped.push(`${row.cartridge} · ${row.powder}: refused (${result.problems.map((problem) => problem.code).join(', ')})`);
      continue;
    }
    comparisons.push({ row, simulatedPressure: result.simulation.maxPressure, simulatedVelocity: result.simulation.muzzleVelocity });
  }
  return { comparisons, skipped };
}

function summarize(label: string, errors: number[]): void {
  if (errors.length === 0) return;
  const absolute = errors.map(Math.abs).sort((a, b) => a - b);
  const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  const rms = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  const median = absolute[Math.floor(absolute.length / 2)]!;
  console.log(`${label}: ${errors.length} rows, mean ${(mean * 100).toFixed(1)} %, RMS ${(rms * 100).toFixed(1)} %, median |error| ${(median * 100).toFixed(1)} %`);
}

function main(): void {
  const args = process.argv.slice(2);
  const engine = args.includes('--engine') && args[args.indexOf('--engine') + 1] === researchEngine.id ? researchEngine : grtTraditional;
  const path = args.find((argument) => !argument.startsWith('--') && argument !== engine.id);
  if (!path) {
    console.error('usage: node tools/validation/pressure.ts <rows.csv> [--engine research-1]');
    process.exitCode = 1;
    return;
  }
  const rows = readRows(readFileSync(path, 'utf8'));
  const { comparisons, skipped } = compare(rows, engine);
  console.log(`engine: ${engine.name}\n`);
  const psi = comparisons.filter(({ row }) => row.standard === 'psi');
  for (const { row, simulatedPressure, simulatedVelocity } of comparisons) {
    const published = row.standard === 'psi' ? `${(row.pressure / units.PSI).toFixed(0)} psi` : `${row.pressure.toFixed(0)} CUP`;
    const simulated = `${(simulatedPressure / units.PSI).toFixed(0)} psi`;
    const error = row.standard === 'psi' ? `${(((simulatedPressure - row.pressure) / row.pressure) * 100).toFixed(1)} %` : '—';
    console.log(
      `${`${row.cartridge} · ${row.powder}`.slice(0, 44).padEnd(44)} ${(row.charge / units.GRAIN).toFixed(1)} gr  ` +
        `published ${published.padStart(10)}  simulated ${simulated.padStart(10)}  ${error.padStart(7)}  ` +
        `velocity ${(row.velocity / units.FOOT_PER_SECOND).toFixed(0)} → ${(simulatedVelocity / units.FOOT_PER_SECOND).toFixed(0)} ft/s`,
    );
  }
  console.log();
  summarize('pressure (psi rows)', psi.map(({ row, simulatedPressure }) => (simulatedPressure - row.pressure) / row.pressure));
  summarize('velocity (all rows)', comparisons.map(({ row, simulatedVelocity }) => (simulatedVelocity - row.velocity) / row.velocity));
  const cup = comparisons.length - psi.length;
  if (cup > 0) console.log(`${cup} rows are in CUP, which is not a pressure: they are listed but not scored.`);
  if (skipped.length > 0) {
    console.log(`\n${skipped.length} rows skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) main();
