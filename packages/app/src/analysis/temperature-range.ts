import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { speedRegime } from './speed-of-sound.ts';

/**
 * Over which powder temperatures the load stays within limits in the simulation, from −50 to 50 °C
 * (issue #13, the maintainer's scale): the peak under the maximum, the same speed regime as at the load's
 * own temperature (a subsonic load staying subsonic), and the powder still burning out if it does at the
 * load's temperature. Never a statement of safety: only what the model predicts.
 */

/** Below this burnt fraction at the muzzle, much of the powder leaves unburnt. */
export const INCOMPLETE_BURN = 0.85;

/** The scale's ends, °C. */
export const TEMPERATURE_SCALE_CELSIUS = { from: -50, to: 50 } as const;
const ZERO_CELSIUS = 273.15;
/** Grid step, K; boundaries are then refined by bisection to `REFINED_STEP` (about 30 simulations in all). */
const GRID_STEP = 5;
const REFINED_STEP = 0.5;

/** How the load behaves at a temperature, most serious first. */
export type TemperatureState = 'aboveLimit' | 'notSimulated' | 'regimeChange' | 'incompleteBurn' | 'within';

export interface TemperatureSpan {
  /** K. */
  from: number;
  /** K. */
  to: number;
  state: TemperatureState;
}

/** The scale cut into spans of one state each, from cold to hot. `limit` is the lowest maximum, Pa. */
export function temperatureRange(load: Load, shot: Simulation, limit: number): TemperatureSpan[] {
  const own = load.charge.temperature;
  const regime = speedRegime(shot.muzzleVelocity, own);
  const burnsOut = shot.burntFractionAtMuzzle >= INCOMPLETE_BURN;
  const stateAt = (temperature: number): TemperatureState => {
    const result = grtTraditional.simulate({ ...load, charge: { ...load.charge, temperature } });
    if (!result.ok) return 'notSimulated';
    const simulation = result.simulation;
    if (simulation.maxPressure > limit) return 'aboveLimit';
    // A transonic load has no regime to keep.
    if (regime !== 'transonic' && speedRegime(simulation.muzzleVelocity, temperature) !== regime) return 'regimeChange';
    if (burnsOut && simulation.burntFractionAtMuzzle < INCOMPLETE_BURN) return 'incompleteBurn';
    return 'within';
  };

  const from = TEMPERATURE_SCALE_CELSIUS.from + ZERO_CELSIUS;
  const to = TEMPERATURE_SCALE_CELSIUS.to + ZERO_CELSIUS;
  const grid: Array<{ temperature: number; state: TemperatureState }> = [];
  for (let temperature = from; temperature <= to + 1e-9; temperature += GRID_STEP) {
    grid.push({ temperature, state: stateAt(temperature) });
  }

  const spans: TemperatureSpan[] = [{ from, to: from, state: grid[0]!.state }];
  for (let index = 1; index < grid.length; index++) {
    const previous = grid[index - 1]!;
    const current = grid[index]!;
    const span = spans[spans.length - 1]!;
    if (current.state === span.state) continue;
    // The change lies between the two grid points: bisect until the bracket is narrow.
    let low = previous.temperature;
    let high = current.temperature;
    while (high - low > REFINED_STEP) {
      const middle = (low + high) / 2;
      if (stateAt(middle) === previous.state) low = middle;
      else high = middle;
    }
    const boundary = (low + high) / 2;
    span.to = boundary;
    spans.push({ from: boundary, to: boundary, state: current.state });
  }
  spans[spans.length - 1]!.to = to;
  return spans;
}

/** The span of the load's own temperature, if it is within limits there. */
export function withinSpan(spans: readonly TemperatureSpan[], temperature: number): TemperatureSpan | undefined {
  return spans.find((span) => span.state === 'within' && temperature >= span.from && temperature <= span.to);
}
