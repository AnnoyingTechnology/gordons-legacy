import { readFileSync } from 'node:fs';
import { importGrtLoad, seatingDepth, type Load } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { sensitivities, vary } from '../src/analysis/sensitivity.ts';

const load: Load = (() => {
  const result = importGrtLoad(
    readFileSync(new URL('../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error('fixture');
  return result.value;
})();

test('each variation raises the peak pressure, and all of them together raise it most', () => {
  const results = sensitivities(load)!;
  for (const { variation, change } of results) expect(change, variation).toBeGreaterThan(0);
  const combined = results.find((entry) => entry.variation === 'combined')!.change!;
  for (const { change } of results) expect(combined).toBeGreaterThanOrEqual(change!);
});

test('seating deeper shortens the overall length by 0.5 mm', () => {
  expect(seatingDepth(vary(load, 'seating')) - seatingDepth(load)).toBeCloseTo(0.0005, 12);
});
