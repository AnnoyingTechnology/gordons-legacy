import type { Load } from '@gordons-legacy/formats';
import type { Engine, Simulation, SimulationWarning } from '../engine.ts';
import { grtInputs } from './inputs.ts';
import { solve } from './solver.ts';

const PASCALS_PER_BAR = 1e5;

/**
 * The "GRT Traditional" engine: reproduces Gordon's Reloading Tool 2021.2030
 * (docs/model/grt-traditional.md).
 */
export const grtTraditional: Engine = {
  id: 'grt-traditional',
  name: 'GRT Traditional',
  simulate(load: Load): Simulation {
    const inputs = grtInputs(load);
    const solution = solve(inputs);
    const { points } = solution;
    const count = points.length;
    const curve = {
      travel: new Float64Array(count),
      pressure: new Float64Array(count),
      velocity: new Float64Array(count),
      burntFraction: new Float64Array(count),
      projectileEnergy: new Float64Array(count),
    };
    let peakIndex = 0;
    points.forEach((point, index) => {
      curve.travel[index] = point.travel;
      curve.pressure[index] = point.pressure * PASCALS_PER_BAR;
      curve.velocity[index] = point.velocity;
      curve.burntFraction[index] = point.burntFraction;
      curve.projectileEnergy[index] = point.projectileEnergy;
      if (point.pressure > points[peakIndex]!.pressure) peakIndex = index;
    });
    const muzzle = points[count - 1]!;
    const peak = points[peakIndex]!;
    const burnout = solution.burnoutIndex < count ? points[solution.burnoutIndex - 1] : undefined;

    const warnings: SimulationWarning[] = [];
    if (peak.pressure < 2 * inputs.initialPressure) warnings.push('pressure-too-low');
    if (inputs.sebertFactor < 0) warnings.push('invalid-input');
    if (load.barrel.gasLeaks.length > 0 || load.barrel.jumpToLands !== undefined || !solution.supported) {
      warnings.push('unsupported-feature');
    }

    return {
      engine: 'grt-traditional',
      maxPressure: peak.pressure * PASCALS_PER_BAR,
      maxPressureTravel: peak.travel,
      muzzleVelocity: muzzle.velocity,
      muzzlePressure: muzzle.pressure * PASCALS_PER_BAR,
      burntFractionAtMuzzle: solution.finalBurntFraction,
      ...(burnout ? { burnout: { travel: burnout.travel, pressure: burnout.pressure * PASCALS_PER_BAR } } : {}),
      seatedBasePosition: solution.seatedBasePosition,
      curve,
      warnings,
    };
  },
};
