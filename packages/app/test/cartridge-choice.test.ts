import { describe, expect, it } from 'vitest';
import { communityComponents, grtComponents, type ComponentEntry } from '../src/state/components.ts';
import { caliberChoices, calibersFromLoads, matchingCaliber } from '../src/state/cartridge-choice.ts';
import { exampleLoad } from '../src/state/example-load.ts';

const base = communityComponents().find((entry) => entry.kind === 'caliber')!;
if (base.kind !== 'caliber') throw new Error('Missing fixture');
const definition = base.value;
const entry = (name: string, id = name, origin: 'user' | 'community' = 'community'): ComponentEntry => ({
  id, kind: 'caliber', source: { origin, file: id, author: '', date: '' }, value: { ...definition, name },
});

describe('gun cartridge preselection', () => {
  it("reads makers' spellings as the cartridges GRT's catalogue defines, and leaves the ambiguous ones", () => {
    const grt = grtComponents();
    const chosen = (name: string) => matchingCaliber(name, grt)?.value.name;
    expect(chosen('30-06 SPRG')).toBe('.30-06 Spring.');
    expect(chosen('.380 Auto')).toBe('9 mm Browning court');
    expect(chosen('5.56x45mm NATO')).toBe('.223 Rem.');
    expect(chosen('.45-70 Gov.')).toBe('.45-70 Govt.');
    expect(chosen('.300 WBY MAG')).toBe('.300 Weath. Mag.');
    expect(chosen('350 LGND')).toBe('.350 Legend');
    expect(chosen('6.5 CRDMR')).toBe('6.5 Creedmoor');
    expect(chosen('.44 Magnum')).toBe('.44 Rem. Mag.');
    expect(chosen('.300 WIN')).toBeUndefined();
    expect(chosen('9mm')).toBeUndefined();
  });

  it("prefers the user's definition, then GRT's, then the community's", () => {
    const luger = (origin: 'user' | 'grt' | 'community', sebertFactor: number): ComponentEntry => ({
      id: origin, kind: 'caliber', source: { origin, file: '', author: '', date: '' }, value: { ...definition, name: '9 mm Luger', sebertFactor },
    });
    const community = luger('community', 1.5);
    const grt = luger('grt', 1);
    expect(matchingCaliber('9x19 mm', [community, grt])).toBe(grt);
    // An identical community copy listed first does not hide GRT's.
    expect(matchingCaliber('9x19 mm', [luger('community', 1), grt, community])).toBe(grt);
    const own = luger('user', 2);
    expect(matchingCaliber('9x19 mm', [community, grt, own])).toBe(own);
  });

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
