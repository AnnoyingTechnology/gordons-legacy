import { describe, expect, it } from 'vitest';
import { integrate, type OdeOptions } from '../src/numerics/ode.ts';

const options: OdeOptions = { relativeTolerance: 1e-10, absoluteTolerance: 1e-12, initialStep: 1e-3, maximumStep: 0.1, maximumSteps: 100000 };

describe('integrate (Dormand-Prince 5(4))', () => {
  it('follows exponential decay to the tolerance', () => {
    const result = integrate((_, y, dy) => (dy[0] = -2 * y[0]!), 0, Float64Array.of(1), 3, options);
    expect(result.completed).toBe(true);
    expect(result.y[0]).toBeCloseTo(Math.exp(-6), 9);
  });

  it('keeps an oscillator on its circle', () => {
    const result = integrate(
      (_, y, dy) => {
        dy[0] = y[1]!;
        dy[1] = -y[0]!;
      },
      0,
      Float64Array.of(1, 0),
      10 * Math.PI,
      options,
    );
    expect(result.y[0]).toBeCloseTo(1, 7);
    expect(result.y[1]).toBeCloseTo(0, 7);
  });

  it('stops where an event crosses zero', () => {
    // A falling body from 10 m: it reaches the ground at t = √(2·10/9.81).
    const result = integrate(
      (_, y, dy) => {
        dy[0] = y[1]!;
        dy[1] = -9.81;
      },
      0,
      Float64Array.of(10, 0),
      10,
      options,
      (_, y) => -y[0]!,
    );
    expect(result.eventReached).toBe(true);
    expect(result.t).toBeCloseTo(Math.sqrt(20 / 9.81), 9);
    expect(result.y[0]).toBeCloseTo(0, 9);
  });

  it('gives up rather than loop forever', () => {
    const result = integrate((_, y, dy) => (dy[0] = y[0]! * y[0]!), 0, Float64Array.of(1), 2, { ...options, maximumSteps: 500 });
    expect(result.completed).toBe(false);
  });
});
