/**
 * Compares the GRT Traditional engine with chronograph measurements stored in load files: for every
 * measured charge, the simulated muzzle velocity against the measured mean. Maintainer tool; prints
 * one line per charge and a summary.
 *
 *     node tools/validation/chronograph.ts <file.grtload | file.json>...
 *
 * The measured velocity is taken at the chronograph, a few metres out, so it reads slightly below the
 * muzzle velocity; and a measurement note may name another gun than the load's barrel.
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { grtTraditional } from '@gordons-legacy/engine';
import { importGrtLoad, parseLoad, type Load } from '@gordons-legacy/formats';

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
  const text = readFileSync(path, 'utf8');
  const result = extname(path).toLowerCase() === '.grtload' ? importGrtLoad(text) : parseLoad(text);
  return result.ok ? result.value : undefined;
}

export function compare(paths: string[]): Comparison[] {
  const comparisons: Comparison[] = [];
  for (const path of paths) {
    const load = readLoad(path);
    if (!load) continue;
    for (const series of load.measurements) {
      for (const charge of series.charges) {
        const velocities = charge.shots.map((shot) => shot.velocity).filter((velocity) => velocity > 0);
        if (velocities.length === 0) continue;
        const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, mass: charge.chargeMass } });
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

function main(): void {
  const comparisons = compare(process.argv.slice(2));
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
