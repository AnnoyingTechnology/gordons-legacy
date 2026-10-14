import { readFileSync } from 'node:fs';
import { importGrtLoad, parseLoad, serializeLoad, seatingDepth, type Load } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { FIELD_GROUPS, type ChoiceField, type NumberField } from '../src/editor/fields.ts';

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
    // Fields hidden for this load (a flat base has no tail dimensions) don't apply to it.
    if (field.visible && !field.visible(load)) continue;
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

test('a boat-tail gets editable tail dimensions; back to flat, it loses them', () => {
  const base = FIELD_GROUPS.flatMap((group) => group.fields).find((field): field is ChoiceField => field.type === 'choice' && field.label === 'field.base')!;
  const tailLength = numberFields.find((field) => field.label === 'field.baseLength')!;
  const boattail = tailLength.set(base.set(load, 'boattail'), 0.004);
  expect(tailLength.visible!(boattail)).toBe(true);
  expect(boattail.projectile.base).toEqual({ shape: 'boattail', length: 0.004, diameterA: 0, diameterB: 0 });
  expect(parseLoad(serializeLoad(boattail)).ok).toBe(true);
  expect(base.set(boattail, 'flat').projectile.base).toEqual({ shape: 'flat' });
});

test('either ladder field alone makes a ladder, the other taking a default', () => {
  const noLadder: Load = { ...load };
  delete (noLadder as { ladder?: unknown }).ladder;
  const charges = numberFields.find((field) => field.label === 'field.ladderSteps')!;
  const step = numberFields.find((field) => field.label === 'field.ladderStep')!;
  expect(charges.set(noLadder, 4).ladder).toEqual({ steps: 4, massStep: noLadder.charge.mass * 0.01 });
  expect(step.set(noLadder, 0.00002).ladder).toEqual({ steps: 5, massStep: 0.00002 });
});
