import { grtTraditional } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { assessLoad, type Assessment } from './load-assessment.ts';
import { sensitivities, type Sensitivity } from './sensitivity.ts';

/**
 * The analyses that need many simulations (about 40 for a load): the load's review, its bench
 * variations and its powder-temperature table. They run in a worker (review-worker.ts), so that typing
 * in the editor never waits for them; plain data, so that they cross to the page unchanged.
 */
export interface Review {
  assessment: Assessment;
  /** Undefined when the load itself can't be simulated. */
  sensitivities: Sensitivity[] | undefined;
  temperatures: TemperatureRow[];
}

/** The load at one powder temperature. */
export interface TemperatureRow {
  /** K. */
  temperature: number;
  /** Peak pressure, Pa, and muzzle velocity, m/s; absent when the model refuses the load at this temperature. */
  peakPressure?: number;
  muzzleVelocity?: number;
}

/** Powder temperatures of the table, °C: from a cold winter day to a cartridge left in the sun. */
export const TABLE_TEMPERATURES_CELSIUS = [-20, 0, 21, 35, 50];
const ZERO_CELSIUS = 273.15;

/** The review of a load; undefined when the load can't be simulated. */
export function computeReview(load: Load): Review | undefined {
  const result = grtTraditional.simulate(load);
  if (!result.ok) return undefined;
  return {
    assessment: assessLoad(load, result.simulation),
    sensitivities: sensitivities(load),
    temperatures: TABLE_TEMPERATURES_CELSIUS.map((celsius) => temperatureRow(load, celsius + ZERO_CELSIUS)),
  };
}

function temperatureRow(load: Load, temperature: number): TemperatureRow {
  const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, temperature } });
  if (!result.ok) return { temperature };
  return { temperature, peakPressure: result.simulation.maxPressure, muzzleVelocity: result.simulation.muzzleVelocity };
}
