import { grtTraditional } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { shotStatistics } from '../measurements/statistics.ts';
import { assessLoad, type AssessmentLevel } from './load-assessment.ts';
import { muzzleBlast } from './muzzle-blast.ts';
import { groupStatistics, minutesOfAngle } from './shot-group.ts';

/** What the library shows of a load at a glance: simulated figures, the review's level, and what was measured. */
export interface LoadSummary {
  /** Absent when the load can't be simulated. */
  simulated?: {
    /** m/s. */
    muzzleVelocity: number;
    /** J. */
    muzzleEnergy: number;
    /** Peak over the lowest maximum known. */
    peakShare: number;
    level: AssessmentLevel;
    /** Muzzle blast at 1 m beside the muzzle, dB peak; absent when not estimated. */
    blastLevel?: number;
    /** True when that estimate lies outside the model's data. */
    blastExtrapolated?: boolean;
  };
  /** Mean of the shots measured with the load's own charge, m/s. */
  measuredVelocity?: number;
  /** The smallest extreme spread of the load's shot groups, as an angle in minutes of angle. */
  bestGroup?: { minutesOfAngle: number; shots: number };
}

const cache = new WeakMap<Load, LoadSummary>();

/** The summary of a load, computed once per load object (loads are replaced, never mutated, on edit). */
export function summarizeLoad(load: Load): LoadSummary {
  const known = cache.get(load);
  if (known) return known;
  const summary: LoadSummary = {};
  const result = grtTraditional.simulate(load);
  if (result.ok) {
    const shot = result.simulation;
    const assessment = assessLoad(load, shot);
    summary.simulated = {
      muzzleVelocity: shot.muzzleVelocity,
      muzzleEnergy: shot.muzzleEnergy,
      peakShare: shot.maxPressure / assessment.limits[0]!.pressure,
      level: assessment.level,
    };
    const blast = muzzleBlast(load, shot);
    if (blast) Object.assign(summary.simulated, { blastLevel: blast.level, blastExtrapolated: blast.extrapolated });
  }
  // Shots fired with the load's charge (within 0.1 %: values converted from grains round slightly).
  const velocities = load.measurements.flatMap((series) =>
    series.charges
      .filter((charge) => Math.abs(charge.chargeMass / load.charge.mass - 1) < 0.001)
      .flatMap((charge) => charge.shots.map((shot) => shot.velocity)),
  );
  const measured = shotStatistics(velocities);
  if (measured) summary.measuredVelocity = measured.mean;
  for (const group of load.shotGroups ?? []) {
    const statistics = groupStatistics(group.hits);
    if (!statistics || !(group.distance > 0)) continue;
    const angle = minutesOfAngle(statistics.extremeSpread, group.distance);
    if (!summary.bestGroup || angle < summary.bestGroup.minutesOfAngle) summary.bestGroup = { minutesOfAngle: angle, shots: statistics.count };
  }
  cache.set(load, summary);
  return summary;
}
