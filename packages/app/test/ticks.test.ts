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
});
