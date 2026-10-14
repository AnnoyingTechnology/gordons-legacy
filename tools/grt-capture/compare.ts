/**
 * Compares the GRT Traditional engine with references captured from GRT (capture.ts), for any set of
 * load files, such as a maintainer's own loads that can't be committed.
 *
 *     node compare.ts --references <directory> <file.grtload>...
 *
 * Prints, per load, the relative error of the peak pressure and the muzzle velocity, and the engine's
 * warnings. Exits with 1 when a supported load differs from GRT by more than 1e-12.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { importGrtLoad } from '@gordons-legacy/formats';
import { grtTraditional } from '@gordons-legacy/engine';
import type { GrtReference } from './capture.ts';

const TOLERANCE = 1e-12;

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

function main(): void {
  const { values, positionals } = parseArgs({ options: { references: { type: 'string' } }, allowPositionals: true });
  if (values.references === undefined || positionals.length === 0) {
    console.error('Usage: node compare.ts --references <directory> <file.grtload>...');
    process.exit(2);
  }
  let failures = 0;
  for (const path of positionals) {
    const name = basename(path, '.grtload');
    let reference: GrtReference;
    try {
      reference = JSON.parse(readFileSync(join(values.references, `${name}.json`), 'utf8')) as GrtReference;
    } catch {
      console.log(`${name}: no reference`);
      continue;
    }
    const imported = importGrtLoad(readFileSync(path, 'utf8'));
    if (!imported.ok) {
      console.log(`${name}: import failed`);
      continue;
    }
    const result = grtTraditional.simulate(imported.value);
    if (!result.ok) {
      failures++;
      console.log(`✗ ${name}: refused (${result.problems.map((problem) => problem.code).join(', ')})`);
      continue;
    }
    const shot = result.simulation;
    const pressureError = relativeError(shot.maxPressure / 1e5, Number.parseFloat(reference.results['MaxPressure'] ?? ''));
    const velocityError = relativeError(shot.muzzleVelocity, Number.parseFloat(reference.results['MuzzleVelocity'] ?? ''));
    const supported = !shot.warnings.includes('unsupported-feature');
    const ok = !supported || (pressureError < TOLERANCE && velocityError < TOLERANCE);
    if (!ok) failures++;
    console.log(
      `${ok ? '  ' : '✗ '}${name.padEnd(70)} Pmax ${pressureError.toExponential(1).padStart(8)}  v0 ${velocityError.toExponential(1).padStart(8)}  ${shot.warnings.join(', ')}`,
    );
  }
  console.log(failures === 0 ? 'All supported loads match GRT.' : `${failures} supported loads differ from GRT.`);
  process.exit(failures === 0 ? 0 : 1);
}

if (import.meta.main) main();
