import { expect, test } from 'vitest';
import { shotStatistics } from '../src/measurements/statistics.ts';

test('mean, sample standard deviation and extreme spread of a string', () => {
  const statistics = shotStatistics([300, 305, 310]);
  expect(statistics?.count).toBe(3);
  expect(statistics?.mean).toBe(305);
  expect(statistics?.standardDeviation).toBeCloseTo(5, 12);
  expect(statistics?.extremeSpread).toBe(10);
});

test('a single shot has no standard deviation', () => {
  expect(shotStatistics([412])).toEqual({ count: 1, mean: 412, extremeSpread: 0 });
});

test('no shots, no statistics', () => {
  expect(shotStatistics([])).toBeUndefined();
});
