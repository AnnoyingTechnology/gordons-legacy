import { describe, expect, it } from 'vitest';
import { communityComponents, type ComponentEntry } from '../src/state/components.ts';
import { caliberChoices, calibersFromLoads, matchingCaliber } from '../src/state/cartridge-choice.ts';
import { exampleLoad } from '../src/state/example-load.ts';

const base = communityComponents().find((entry) => entry.kind === 'caliber')!;
if (base.kind !== 'caliber') throw new Error('Missing fixture');
const definition = base.value;
const entry = (name: string, id = name, origin: 'user' | 'community' = 'community'): ComponentEntry => ({
  id, kind: 'caliber', source: { origin, file: id, author: '', date: '' }, value: { ...definition, name },
});

describe('gun cartridge preselection', () => {
  it('finds the existing .308 case variants by their declared alternative name', () => {
    const choices = caliberChoices('308 Win.', communityComponents());
    expect(choices).toHaveLength(7);
    expect(choices.map((entry) => entry.value.name)).toContain('.308 Win. Lapua #1');
    expect(matchingCaliber('308 Win.', communityComponents())).toBeUndefined();
    expect(caliberChoices('308 Winchester', communityComponents())).toEqual(choices);
    expect(caliberChoices('7.62 NATO', communityComponents())).toEqual([]);
  });
  it('matches explicit 9x19/Luger synonyms, including imported parenthesized names', () => {
    const luger = entry('9 mm Luger');
    expect(matchingCaliber('9x19 mm', [luger])).toBe(luger);
    expect(matchingCaliber('9 × 19 mm', [luger])).toBe(luger);
    const longName = entry('9 mm Luger (9 mm Para(bellum), 9 x 19 (mm))');
    expect(matchingCaliber('9x19 mm', [longName])).toBe(longName);
  });

  it('does not confuse other cases, pressure variants or a bare caliber', () => {
    expect(matchingCaliber('9x19 mm', [entry('9x21 mm')])).toBeUndefined();
    expect(matchingCaliber('9x19 mm', [entry('9 mm Luger +P')])).toBeUndefined();
    expect(matchingCaliber('9x19 mm', [entry('9 mm Luger (9x19) +P')])).toBeUndefined();
    const plus = entry('9 mm Luger +P');
    if (plus.kind === 'caliber') plus.value.alternativeNames = '9x19 mm';
    expect(matchingCaliber('9x19 mm', [plus])).toBeUndefined();
    expect(matchingCaliber('.357', [entry('.357 SIG'), entry('.357 Magnum')])).toBeUndefined();
    expect(matchingCaliber('', [entry('9 mm Luger')])).toBeUndefined();
  });

  it('uses an existing load definition and keeps conflicting definitions undecided', () => {
    const load = exampleLoad({ title: 'Own', note: '' })!;
    load.cartridge.definition = { ...definition, name: '9 mm Luger' };
    const own = calibersFromLoads([{ id: 'open:1', name: 'Own', load, origin: 'open' }]);
    expect(own).toHaveLength(1);
    expect(matchingCaliber('9x19 mm', [...own, entry('9 mm Luger')])).toBe(own[0]);
    expect(matchingCaliber('9x19 mm', [...own, ...own])).toBe(own[0]);
    const other = structuredClone(own[0]!);
    other.id = 'another';
    other.value.caseType = 'Different source description';
    expect(matchingCaliber('9x19 mm', [...own, other])).toBeUndefined();
  });
});
