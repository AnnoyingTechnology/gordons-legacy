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
  const nan = { brisance: Number.NaN, progressivity: Number.NaN, combined: Number.NaN };
  const of = (combined: number) => ({ brisance: combined, progressivity: combined, combined });
  expect([of(3), nan, of(1), nan, of(2)].sort(byCombinedFactor).map((factors) => factors.combined)).toEqual([1, 2, 3, Number.NaN, Number.NaN]);
});
