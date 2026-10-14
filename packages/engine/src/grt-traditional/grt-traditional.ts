import type { Load } from '@gordons-legacy/formats';
import type { Engine, SimulationResult, SimulationWarning } from '../engine.ts';
import { grtInputs } from './inputs.ts';
import { recoil, tenPercentPeakTime } from './results.ts';
import { solve } from './solver.ts';
import { validateInputs } from './validation.ts';

const PASCALS_PER_BAR = 1e5;
const SECONDS_PER_MILLISECOND = 1e-3;

/**
 * The "GRT Traditional" engine: reproduces Gordon's Reloading Tool 2021.2030
 * (docs/model/grt-traditional.md).
 */
export const grtTraditional: Engine = {
  id: 'grt-traditional',
  name: 'GRT Traditional',
  simulate(load: Load): SimulationResult {
    const inputs = grtInputs(load);
    const problems = validateInputs(inputs);
    if (problems.length > 0) return { ok: false, problems };
    const solution = solve(inputs);
    const { points } = solution;
    const count = points.length;
    const curve = {
      travel: new Float64Array(count),
      pressure: new Float64Array(count),
      velocity: new Float64Array(count),
      burntFraction: new Float64Array(count),
      projectileEnergy: new Float64Array(count),
      time: new Float64Array(count),
    };
    let peakIndex = 0;
    points.forEach((point, index) => {
      curve.travel[index] = point.travel;
      curve.pressure[index] = point.pressure * PASCALS_PER_BAR;
      curve.velocity[index] = point.velocity;
      curve.burntFraction[index] = point.burntFraction;
      curve.projectileEnergy[index] = point.projectileEnergy;
      curve.time[index] = point.time * SECONDS_PER_MILLISECOND;
      if (point.pressure > points[peakIndex]!.pressure) peakIndex = index;
    });
    // A safety net: valid inputs are expected to give a complete curve of finite numbers.
    const finite = Object.values(curve).every((values) => values.every(Number.isFinite));
    if (!solution.completed || count === 0 || !finite || !Number.isFinite(solution.finalBurntFraction)) {
      return { ok: false, problems: [{ code: 'numerical-failure' }] };
    }
    const muzzle = points[count - 1]!;
    const peak = points[peakIndex]!;
    const burnout = solution.burnoutIndex < count ? points[solution.burnoutIndex - 1] : undefined;
    const muzzleEnergy = Math.pow(muzzle.velocity, 2) * inputs.projectileMass * 0.5;
    const tenPercentTime = tenPercentPeakTime(points, peak.pressure, inputs.initialPressure);

    const warnings: SimulationWarning[] = [];
    if (peak.pressure < 2 * inputs.initialPressure) warnings.push('pressure-too-low');

    const simulation = {
      engine: 'grt-traditional',
      maxPressure: peak.pressure * PASCALS_PER_BAR,
      maxPressureTravel: peak.travel,
      muzzleVelocity: muzzle.velocity,
      muzzlePressure: muzzle.pressure * PASCALS_PER_BAR,
      barrelTime: muzzle.time * SECONDS_PER_MILLISECOND,
      burntFractionAtMuzzle: solution.finalBurntFraction,
      muzzleEnergy,
      efficiency: muzzleEnergy / (inputs.heatOfExplosion * inputs.chargeMass * 1000),
      ...(inputs.twistLength > 0 ? { muzzleSpinRate: muzzle.velocity / inputs.twistLength } : {}),
      ...(tenPercentTime === undefined
        ? {}
        : {
            tenPercentPeakTime: tenPercentTime * SECONDS_PER_MILLISECOND,
            leadTime: (muzzle.time - tenPercentTime) * SECONDS_PER_MILLISECOND,
          }),
      ...(burnout ? { burnout: { travel: burnout.travel, pressure: burnout.pressure * PASCALS_PER_BAR } } : {}),
      seatedBasePosition: solution.seatedBasePosition,
      recoil: recoil(inputs, solution, muzzle, load.barrel.gunMass),
      curve,
      warnings,
    };
    return { ok: true, simulation };
  },
};
