import { expect, test } from 'vitest';
import { groupStatistics, milliradians, minutesOfAngle } from '../src/analysis/shot-group.ts';

test('a square of four hits 10 mm apart', () => {
  const statistics = groupStatistics([
    { x: 0, y: 0 },
    { x: 0.01, y: 0 },
    { x: 0, y: 0.01 },
    { x: 0.01, y: 0.01 },
  ])!;
  expect(statistics.centre).toEqual({ x: 0.005, y: 0.005 });
  expect(statistics.extremeSpread).toBeCloseTo(Math.SQRT2 * 0.01, 12);
  expect(statistics.minimumSpacing).toBeCloseTo(0.01, 12);
  expect(statistics.meanRadius).toBeCloseTo((Math.SQRT2 * 0.01) / 2, 12);
  // Four values ±5 mm about the mean: sample SD √(4·25/3) mm.
  expect(statistics.horizontalDeviation).toBeCloseTo(Math.sqrt(100 / 3) / 1000, 12);
});

test('one hit is no group', () => {
  expect(groupStatistics([{ x: 0, y: 0 }])).toBeUndefined();
});

test('29.1 mm at 100 m is one minute of angle, 0.291 mrad', () => {
  expect(minutesOfAngle(0.0290888, 100)).toBeCloseTo(1, 4);
  expect(milliradians(0.0290888, 100)).toBeCloseTo(0.290888, 5);
});
