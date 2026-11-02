import type { Load } from './load.ts';

/** The most charges a ladder holds, its own charge included, as in GRT. */
export const MAXIMUM_LADDER_STEPS = 10;

/**
 * The charge masses of a load's ladder, kg, heaviest first: the load's own charge, then one step less
 * each time, `steps` charges in all, as GRT simulates them (the step is subtracted repeatedly, not
 * multiplied, so that the masses match GRT's to the last bits). A load without a ladder gives its own
 * charge only. Reduced charges at or below zero are dropped.
 */
export function ladderChargeMasses(load: Pick<Load, 'charge' | 'ladder'>): number[] {
  const masses = [load.charge.mass];
  if (load.ladder === undefined || load.ladder.steps < 2) return masses;
  let mass = load.charge.mass;
  // GRT's ten at most: a file claiming 1e308 steps of a step too small to subtract would never end.
  const steps = Math.min(load.ladder.steps, MAXIMUM_LADDER_STEPS);
  for (let step = 1; step < steps; step++) {
    mass = mass - load.ladder.massStep;
    if (!(mass > 0)) break;
    masses.push(mass);
  }
  return masses;
}
