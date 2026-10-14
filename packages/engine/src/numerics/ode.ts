/**
 * An adaptive Runge-Kutta integrator for systems of ordinary differential equations: the Dormand-Prince
 * 5(4) pair (J. R. Dormand and P. J. Prince, "A family of embedded Runge-Kutta formulae", Journal of
 * Computational and Applied Mathematics 6, 1980), with step-size control and events.
 */

/** dy/dt at (t, y), written into `derivative`. */
export type Derivative = (t: number, y: Float64Array, derivative: Float64Array) => void;

/** An event: integration stops where `value` crosses zero going up (the state just at the crossing). */
export type Event = (t: number, y: Float64Array) => number;

export interface OdeOptions {
  /** Relative tolerance on each component. */
  relativeTolerance: number;
  /** Absolute tolerance on each component (same units as the component). */
  absoluteTolerance: number;
  /** First step tried. */
  initialStep: number;
  /** Largest step allowed. */
  maximumStep: number;
  /** Gives up after this many steps (accepted or rejected). */
  maximumSteps: number;
}

export interface OdeResult {
  /** Where the integration stopped. */
  t: number;
  y: Float64Array;
  /** True when it stopped on the event, false when it reached the end time. */
  eventReached: boolean;
  /** False when it gave up (too many steps, or a step too small to make progress). */
  completed: boolean;
}

// Dormand-Prince coefficients.
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
/** Fifth-order weights (equal to the last row of A: the method is "first same as last"). */
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
/** Fourth-order weights, for the error estimate. */
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/**
 * Integrates from (t0, y0) to `end`, or to the first upward zero crossing of `event`, located by
 * bisection on the step to within the tolerance. Calls `observe` after each accepted step.
 */
export function integrate(
  derivative: Derivative,
  t0: number,
  y0: Float64Array,
  end: number,
  options: OdeOptions,
  event?: Event,
  observe?: (t: number, y: Float64Array) => void,
): OdeResult {
  const size = y0.length;
  const stages = Array.from({ length: 7 }, () => new Float64Array(size));
  const temporary = new Float64Array(size);
  const next = new Float64Array(size);
  let t = t0;
  let y = Float64Array.from(y0);
  let step = Math.min(options.initialStep, options.maximumStep, end - t0);
  let eventValue = event ? event(t, y) : 0;

  const attempt = (from: number, state: Float64Array, h: number, out: Float64Array): number => {
    derivative(from, state, stages[0]!);
    for (let stage = 1; stage < 7; stage++) {
      const row = A[stage]!;
      for (let index = 0; index < size; index++) {
        let sum = state[index]!;
        for (let previous = 0; previous < stage; previous++) sum += h * row[previous]! * stages[previous]![index]!;
        temporary[index] = sum;
      }
      derivative(from + C[stage]! * h, temporary, stages[stage]!);
    }
    let error = 0;
    for (let index = 0; index < size; index++) {
      let fifth = state[index]!;
      let difference = 0;
      for (let stage = 0; stage < 7; stage++) {
        fifth += h * B5[stage]! * stages[stage]![index]!;
        difference += h * (B5[stage]! - B4[stage]!) * stages[stage]![index]!;
      }
      out[index] = fifth;
      const scale = options.absoluteTolerance + options.relativeTolerance * Math.max(Math.abs(state[index]!), Math.abs(fifth));
      error = Math.max(error, Math.abs(difference) / scale);
    }
    return error;
  };

  for (let count = 0; count < options.maximumSteps; count++) {
    if (t >= end) return { t, y, eventReached: false, completed: true };
    const h = Math.min(step, end - t);
    if (!(h > Math.abs(t) * 1e-15)) return { t, y, eventReached: false, completed: false };
    const error = attempt(t, y, h, next);
    if (!Number.isFinite(error)) {
      step = h / 4;
      continue;
    }
    if (error <= 1) {
      const nextEvent = event ? event(t + h, next) : 0;
      if (event && eventValue < 0 && nextEvent >= 0) {
        // The event lies in this step: bisect on the step length.
        let low = 0;
        let high = h;
        const probe = new Float64Array(size);
        for (let iteration = 0; iteration < 60 && high - low > Math.abs(t) * 1e-15 + 1e-300; iteration++) {
          const middle = (low + high) / 2;
          attempt(t, y, middle, probe);
          if (event(t + middle, probe) >= 0) high = middle;
          else low = middle;
        }
        attempt(t, y, high, probe);
        observe?.(t + high, probe);
        return { t: t + high, y: probe, eventReached: true, completed: true };
      }
      t += h;
      y = Float64Array.from(next);
      eventValue = nextEvent;
      observe?.(t, y);
    }
    // Standard step-size control: safety 0.9, growth between 0.2 and 5.
    const factor = error === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * error ** -0.2));
    step = Math.min(options.maximumStep, h * factor);
  }
  return { t, y, eventReached: false, completed: false };
}
