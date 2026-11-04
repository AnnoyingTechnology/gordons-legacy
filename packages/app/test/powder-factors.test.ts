import { readdirSync, readFileSync } from 'node:fs';
import { importGrtPropellant } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { byCombinedFactor, powderFactors } from '../src/analysis/powder-factors.ts';

const folder = new URL('../../formats/test/fixtures/cc0/powders/', import.meta.url);

test.each(readdirSync(folder))('%s: Br, Bp and Brp as GRT stored them', (file) => {
  const text = readFileSync(new URL(file, folder), 'utf8');
  const stored = (name: string) => Number(new RegExp(`name="${name}" value="([^"]*)"`).exec(text)![1]);
  const result = importGrtPropellant(text);
  if (!result.ok) throw new Error(file);
  const factors = powderFactors(result.value);
  // GRT stores them with 4 decimals.
  expect(factors.brisance).toBeCloseTo(stored('Br'), 3);
  expect(factors.progressivity).toBeCloseTo(stored('Bp'), 3);
  expect(factors.combined).toBeCloseTo(stored('Brp'), 3);
});

test('a powder without factors (k of 1 or less) sorts last, and the order stays defined (#32)', () => {
  const powder = (file: string, heatCapacityRatio?: number) => {
    const result = importGrtPropellant(readFileSync(new URL(file, folder), 'utf8'));
    if (!result.ok) throw new Error(file);
    return powderFactors(heatCapacityRatio === undefined ? result.value : { ...result.value, heatCapacityRatio });
  };
  const [first, second] = readdirSync(folder);
  const real = [powder(first!), powder(second!)];
  const none = [powder(first!, 1), powder(first!, 0.9)];
  expect(none.every((factors) => Number.isNaN(factors.combined))).toBe(true);
  const sorted = [none[0]!, real[0]!, none[1]!, real[1]!].sort(byCombinedFactor);
  expect(sorted.slice(0, 2).map((factors) => factors.combined)).toEqual(real.map((factors) => factors.combined).sort((a, b) => a - b));
  expect(sorted.slice(2).every((factors) => Number.isNaN(factors.combined))).toBe(true);
});
