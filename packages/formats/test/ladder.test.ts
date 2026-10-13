import { expect, test } from 'vitest';
import { ladderChargeMasses } from '../src/index.ts';

test('a ladder steps down from the load charge, which is included', () => {
  expect(ladderChargeMasses({ charge: { mass: 1.0e-3, temperature: 294 }, ladder: { steps: 3, massStep: 0.1e-3 } })).toEqual([
    1.0e-3,
    1.0e-3 - 0.1e-3,
    1.0e-3 - 0.1e-3 - 0.1e-3,
  ]);
});

test('without a ladder, only the load charge', () => {
  expect(ladderChargeMasses({ charge: { mass: 1.0e-3, temperature: 294 } })).toEqual([1.0e-3]);
});

test('charges at or below zero are dropped', () => {
  expect(ladderChargeMasses({ charge: { mass: 0.2e-3, temperature: 294 }, ladder: { steps: 5, massStep: 0.1e-3 } })).toHaveLength(2);
});
