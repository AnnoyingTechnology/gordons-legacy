import { readFileSync } from 'node:fs';
import { importGrtLoad, parseLoad, serializeLoad, seatingDepth, type Load } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { FIELD_GROUPS, type NumberField } from '../src/editor/fields.ts';

const load: Load = (() => {
  const result = importGrtLoad(
    readFileSync(new URL('../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error('fixture');
  return result.value;
})();

const numberFields = FIELD_GROUPS.flatMap((group) => group.fields).filter((field): field is NumberField => field.type === 'number');

test('every field reads back what it writes, and leaves a valid load', () => {
  for (const field of numberFields) {
    const current = field.get(load) ?? 1;
    const changed = field.label === 'field.ladderSteps' ? 4 : current * 1.01 + (current === 0 ? 0.001 : 0);
    const edited = field.set(load, changed);
    if (field.label !== 'field.ladderSteps' && field.label !== 'field.ladderStep') {
      expect(field.get(edited), field.label).toBeCloseTo(changed, 12);
    }
    expect(parseLoad(serializeLoad(edited)).ok, field.label).toBe(true);
  }
});

test('editing does not mutate the original load', () => {
  const before = serializeLoad(load);
  for (const field of numberFields) field.set(load, 1);
  expect(serializeLoad(load)).toBe(before);
});

test('setting the seating depth moves the overall length', () => {
  const field = numberFields.find((f) => f.label === 'field.seatingDepth')!;
  const edited = field.set(load, 0.006);
  expect(seatingDepth(edited)).toBeCloseTo(0.006, 12);
  expect(edited.cartridge.overallLength).toBeCloseTo(load.cartridge.overallLength - (0.006 - seatingDepth(load)), 12);
});
