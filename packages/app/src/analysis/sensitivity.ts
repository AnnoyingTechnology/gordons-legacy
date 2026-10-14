import { grtTraditional } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';

/**
 * How the peak pressure moves when a load varies the way loads do on the bench: a little more powder,
 * a bullet seated deeper, a smaller case, a heavier bullet. Each variation is in the direction that
 * raises the pressure; the last one combines them all.
 */
export type Variation = 'charge' | 'seating' | 'caseCapacity' | 'projectileMass' | 'combined';

/** Sizes of the variations: relative for masses and capacity, m for seating. */
export const VARIATIONS = {
  /** 1 % more powder: about a tenth of a grain in a 10-grain pistol charge, a quarter in a rifle's. */
  charge: 0.01,
  /** 0.5 mm deeper: a typical spread of seating depths, or a bullet setting back in the case. */
  seating: 0.0005,
  /** 2 % less capacity: cases of another make or a thicker batch. */
  caseCapacity: 0.02,
  /** 1 % heavier bullet: a typical lot-to-lot spread. */
  projectileMass: 0.01,
} as const;

export interface Sensitivity {
  variation: Variation;
  /** Peak pressure with the variation, Pa; undefined when the varied load can't be simulated. */
  peakPressure?: number;
  /** Change of the peak against the load's own, relative. */
  change?: number;
}

export function vary(load: Load, variation: Variation): Load {
  switch (variation) {
    case 'charge':
      return { ...load, charge: { ...load.charge, mass: load.charge.mass * (1 + VARIATIONS.charge) } };
    case 'seating':
      return { ...load, cartridge: { ...load.cartridge, overallLength: load.cartridge.overallLength - VARIATIONS.seating } };
    case 'caseCapacity':
      return { ...load, cartridge: { ...load.cartridge, caseCapacity: load.cartridge.caseCapacity * (1 - VARIATIONS.caseCapacity) } };
    case 'projectileMass':
      return { ...load, projectile: { ...load.projectile, mass: load.projectile.mass * (1 + VARIATIONS.projectileMass) } };
    case 'combined':
      return (['charge', 'seating', 'caseCapacity', 'projectileMass'] as const).reduce(vary, load);
  }
}

/** The peak pressure under each variation; undefined when the load itself can't be simulated. */
export function sensitivities(load: Load): Sensitivity[] | undefined {
  const base = grtTraditional.simulate(load);
  if (!base.ok) return undefined;
  const reference = base.simulation.maxPressure;
  return (['charge', 'seating', 'caseCapacity', 'projectileMass', 'combined'] as const).map((variation) => {
    const result = grtTraditional.simulate(vary(load, variation));
    if (!result.ok) return { variation };
    return { variation, peakPressure: result.simulation.maxPressure, change: result.simulation.maxPressure / reference - 1 };
  });
}
