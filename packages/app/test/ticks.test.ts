import { describe, expect, it } from 'vitest';
import { niceTicks } from '../src/charts/ticks.ts';

describe('niceTicks', () => {
  it('uses round steps', () => {
    expect(niceTicks(0, 1000)).toEqual([0, 200, 400, 600, 800, 1000]);
  });

  it('always reaches the maximum, so the plot has room above the highest value', () => {
    const ticks = niceTicks(0, 1725);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1725);
    expect(ticks).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('returns the minimum alone for an empty range', () => {
    expect(niceTicks(3, 3)).toEqual([3]);
  });

  it('ends on ranges where adding a step changes nothing, or the last tick overflows (#32)', () => {
    expect(niceTicks(1e20, 1e20 + 16384, 8).length).toBeLessThan(20);
    expect(niceTicks(0, 1.7e308)).toEqual([0, 1.7e308]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([0]);
  });
});
