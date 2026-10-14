import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import { importGrtLoad, parseLoad, type ImportResult, type Load } from '@gordons-legacy/formats';

export const SAFETY_NOTICE =
  'Simulated values, not load data. Check every charge against published data from the powder or ' +
  'bullet maker, start low and work up.';

/** Reads a load from a `.grtload` file or a saved JSON load. */
export function readLoad(path: string): ImportResult<Load> {
  const text = readFileSync(path, 'utf8');
  return extname(path).toLowerCase() === '.grtload' ? importGrtLoad(text) : parseLoad(text);
}

/** A short, human-readable summary of a simulation, in the units reloaders use. */
export function formatSummary(load: Load, shot: Simulation): string {
  const lines = [
    `${load.cartridge.name} — ${load.projectile.name} — ${load.propellant.maker} ${load.propellant.product}, ` +
      `${(load.charge.mass * 1000).toFixed(3)} g`,
    `Peak pressure    ${(shot.maxPressure / 1e5).toFixed(1)} bar`,
    `Muzzle velocity  ${shot.muzzleVelocity.toFixed(1)} m/s`,
    `Muzzle pressure  ${(shot.muzzlePressure / 1e5).toFixed(1)} bar`,
    `Barrel time      ${(shot.barrelTime * 1000).toFixed(4)} ms`,
    `Burnt at muzzle  ${(shot.burntFractionAtMuzzle * 100).toFixed(1)} %` +
      (shot.burnout ? ` (burnout at ${(shot.burnout.travel * 1000).toFixed(1)} mm of travel)` : ''),
    `Muzzle energy    ${shot.muzzleEnergy.toFixed(0)} J`,
    `Efficiency       ${(shot.efficiency * 100).toFixed(1)} %`,
  ];
  if (shot.leadTime !== undefined) lines.push(`Lead time (BLT)  ${(shot.leadTime * 1000).toFixed(4)} ms from 10 % of peak`);
  if (shot.muzzleSpinRate !== undefined) lines.push(`Spin at muzzle   ${(shot.muzzleSpinRate * 60).toFixed(0)} rpm`);
  lines.push(`Recoil impulse   ${shot.recoil.totalImpulse.toFixed(2)} N·s`);
  if (shot.recoil.gun) {
    lines.push(`Recoil           ${shot.recoil.gun.energy.toFixed(1)} J free recoil energy, ${shot.recoil.gun.velocity.toFixed(2)} m/s`);
  }
  if (shot.warnings.length > 0) lines.push(`Warnings         ${shot.warnings.join(', ')}`);
  lines.push('', SAFETY_NOTICE);
  return lines.join('\n');
}

/** `simulate [--json] <file>`: returns the text to print and the exit code. */
export function simulateCommand(args: string[]): { output: string; exitCode: number } {
  const json = args.includes('--json');
  const files = args.filter((arg) => !arg.startsWith('--'));
  if (files.length !== 1) return { output: 'Usage: simulate [--json] <file.grtload | file.json>', exitCode: 2 };
  const result = readLoad(files[0]!);
  if (!result.ok) {
    return { output: result.issues.map((issue) => `${issue.severity}: ${issue.message}`).join('\n'), exitCode: 1 };
  }
  const simulated = grtTraditional.simulate(result.value);
  if (!simulated.ok) {
    const problems = simulated.problems.map((problem) => `error: ${problem.code}${problem.path ? ` (${problem.path})` : ''}`);
    return { output: ['This load cannot be simulated:', ...problems].join('\n'), exitCode: 1 };
  }
  const shot = simulated.simulation;
  if (json) {
    const curve = Object.fromEntries(Object.entries(shot.curve).map(([name, values]) => [name, Array.from(values as Float64Array)]));
    return { output: JSON.stringify({ notice: SAFETY_NOTICE, ...shot, curve }, null, 2), exitCode: 0 };
  }
  return { output: formatSummary(result.value, shot), exitCode: 0 };
}
