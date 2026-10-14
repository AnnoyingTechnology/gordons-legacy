import { readFileSync } from 'node:fs';
import { importGrtLoad } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { synthesisCandidate } from '../src/editor/synthesis-candidate.ts';
import { communityComponents } from '../src/state/components.ts';

test("a candidate keeps nothing measured with the original powder", () => {
  const result = importGrtLoad(
    readFileSync(new URL('../../formats/test/fixtures/maintainer/TESTED_Ruger_300_blackout_Hornady_110gr_vmax_N110.grtload', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error('fixture');
  const original = result.value;
  expect(original.measurements.length).toBeGreaterThan(0);
  const powder = communityComponents().find((entry) => entry.kind === 'propellant')!.value as typeof original.propellant;
  const candidate = synthesisCandidate(original, powder, 0.0009, 'Candidate', 'Derived by tolerance synthesis.');
  expect(candidate.measurements).toEqual([]);
  expect(candidate.pictures).toEqual([]);
  expect(candidate.shotGroups).toBeUndefined();
  expect(candidate.notes).toEqual([{ title: 'Candidate', text: 'Derived by tolerance synthesis.', showInReport: true, isReportTemplate: false }]);
  expect(candidate.propellant).toBe(powder);
  expect(candidate.charge.mass).toBe(0.0009);
  expect(candidate.cartridge).toEqual(original.cartridge);
});
