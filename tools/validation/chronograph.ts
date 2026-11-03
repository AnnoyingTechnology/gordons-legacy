/**
 * Compares the GRT Traditional engine with chronograph measurements stored in load files: for every
 * measured charge, the simulated muzzle velocity against the measured mean. Maintainer tool; prints
 * one line per charge and a summary.
 *
 *     node tools/validation/chronograph.ts [--engine research-1] <file.grtload | file.json>...
 *
 * The measured velocity is taken at the chronograph, a few metres out, so it reads slightly below the
 * muzzle velocity; and a measurement note may name another gun than the load's barrel.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { grtTraditional, researchEngine, type Engine } from '@gordons-legacy/engine';
import { readLoadFile, type Load } from '@gordons-legacy/formats';

interface Comparison {
  file: string;
  caliber: string;
  powder: string;
  charge: number;
  shots: number;
  measured: number;
  simulated: number;
  /** Simulated peak pressure, Pa. */
  peak: number;
  note: string;
}

function readLoad(path: string): Load | undefined {
  const result = readLoadFile(basename(path), readFileSync(path, 'utf8'));
  return result.ok ? result.value : undefined;
}

export function compare(paths: string[], engine: Engine = grtTraditional): Comparison[] {
  const comparisons: Comparison[] = [];
  for (const path of paths) {
    const load = readLoad(path);
    if (!load) continue;
    for (const series of load.measurements) {
      for (const charge of series.charges) {
        const velocities = charge.shots.map((shot) => shot.velocity).filter((velocity) => velocity > 0);
        if (velocities.length === 0) continue;
        const result = engine.simulate({ ...load, charge: { ...load.charge, mass: charge.chargeMass } });
        if (!result.ok) continue;
        comparisons.push({
          file: basename(path),
          caliber: load.cartridge.name,
          powder: `${load.propellant.maker} ${load.propellant.product}`.trim(),
          charge: charge.chargeMass,
          shots: velocities.length,
          measured: velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length,
          simulated: result.simulation.muzzleVelocity,
          peak: result.simulation.maxPressure,
          note: charge.note,
        });
      }
    }
  }
  return comparisons;
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
}

/** The engines `--engine` can name, by their id. */
const ENGINES: readonly Engine[] = [grtTraditional, researchEngine];

/**
 * The command line: the engine to compare (GRT Traditional unless `--engine` names another) and the load
 * files. An engine id that names no engine is a problem, not a silent fallback, since the summary would
 * otherwise be read as the statistics of an engine that never ran.
 */
export function chronographArguments(argv: readonly string[]): { engine: Engine; paths: string[] } | { problem: string } {
  const engineIndex = argv.indexOf('--engine');
  if (engineIndex < 0) return { engine: grtTraditional, paths: [...argv] };
  const engineId = argv[engineIndex + 1];
  const engine = ENGINES.find((candidate) => candidate.id === engineId);
  if (engine === undefined) {
    return { problem: `--engine takes one of ${ENGINES.map((candidate) => candidate.id).join(', ')}, not ${engineId ?? 'nothing'}` };
  }
  return { engine, paths: argv.filter((_, index) => index !== engineIndex && index !== engineIndex + 1) };
}

function main(): void {
  const args = chronographArguments(process.argv.slice(2));
  if ('problem' in args) {
    console.error(`${args.problem}\nusage: node tools/validation/chronograph.ts [--engine research-1] <file.grtload | file.json>...`);
    process.exitCode = 1;
    return;
  }
  const { engine, paths } = args;
  console.log(`engine: ${engine.name}`);
  const comparisons = compare(paths, engine);
  const errors = comparisons.map((entry) => (entry.simulated - entry.measured) / entry.measured);
  for (const [index, entry] of comparisons.entries()) {
    console.log(
      `${entry.file.slice(0, 60).padEnd(60)} ${(entry.charge * 1000).toFixed(3)} g  ${entry.shots} shots  ` +
        `measured ${entry.measured.toFixed(0)}  simulated ${entry.simulated.toFixed(0)} m/s  ${(errors[index]! * 100).toFixed(1)} %`,
    );
  }
  console.log(`\n${comparisons.length} measured charges in ${new Set(comparisons.map((entry) => entry.file)).size} loads`);
  summarize('all', errors);
  const where = (test: (entry: Comparison) => boolean) => errors.filter((_, index) => test(comparisons[index]!));
  summarize('peak below 1500 bar', where((entry) => entry.peak < 1500e5));
  summarize('peak 1500 bar or more', where((entry) => entry.peak >= 1500e5));
  // GRT users save a copy after fitting the powder to their chronograph ("-OBT" in these file names).
  summarize('files named as calibrated (-OBT)', where((entry) => /-OBT/i.test(entry.file)));
  summarize('other files', where((entry) => !/-OBT/i.test(entry.file)));
}

function summarize(label: string, errors: number[]): void {
  if (errors.length === 0) return;
  const absolute = errors.map(Math.abs).sort((a, b) => a - b);
  const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  const rms = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  console.log(`${label}: ${errors.length} charges, mean error ${(mean * 100).toFixed(1)} %, RMS ${(rms * 100).toFixed(1)} %, ` +
    `median |error| ${(percentile(absolute, 0.5) * 100).toFixed(1)} %, 90th percentile ${(percentile(absolute, 0.9) * 100).toFixed(1)} %`);
}

if (import.meta.main) main();
