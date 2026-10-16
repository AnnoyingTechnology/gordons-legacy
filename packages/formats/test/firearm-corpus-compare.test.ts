import { describe, expect, it } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '../src/index.ts';
import { changes } from '../../../tools/data/firearms/compare-corpus.ts';

/**
 * The diff a refresh is read as (tools/data/firearms/compare-corpus.ts, issue #30). The cases below are
 * the ones a refresh of 2026-10-16 actually produced, with invented figures: a twist that appeared
 * because the reading of the page improved, and a cartridge respelled.
 */
function gun(barrel: Partial<Firearm['barrel']>, published: Record<string, string> = {}, cartridge = '.308 Win.'): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: 'Example 7',
    cartridge,
    barrel: { name: 'Example 7', length: 0.56, gasLeaks: [], ...barrel },
    source: { kind: 'published', publisher: 'Example Arms', url: 'https://example.invalid/7', retrieved: '2026-10-16', massBasis: 'unstated', published },
  };
}

describe('comparing a refresh with what is published', () => {
  it('says nothing where the two readings agree', () => {
    expect(changes(gun({ gunMass: 3.4, twistLength: 0.254 }), gun({ gunMass: 3.4, twistLength: 0.254 }))).toEqual([]);
    // A figure that moved by less than a tenth of a millimetre is the same figure written differently.
    expect(changes(gun({ length: 0.5588 }), gun({ length: 0.55880001 }))).toEqual([]);
  });

  it('reports a figure that appeared, with the string the page prints', () => {
    const before = gun({});
    const after = gun({ twistLength: 9.5 * units.INCH }, { twist: '1:9,5"' });
    expect(changes(before, after)).toEqual(['twist none → 1:9.5" (the page prints "1:9,5"")']);
  });

  it('reports a figure that changed, which means one of the two readings is wrong', () => {
    const before = gun({ length: 0.469 }, { barrelLength: '18.50"' });
    const after = gun({ length: 0.4699 }, { barrelLength: '18.50"' });
    expect(changes(before, after)).toEqual(['barrel 469.0 mm → 469.9 mm (the page prints "18.50"")']);
    expect(changes(gun({ gunMass: 3.4 }), gun({ gunMass: 3.2 }, { weight: '3,2 kg' }))).toEqual([
      'mass 3400 g → 3200 g (the page prints "3,2 kg")',
    ]);
  });

  it('reports a cartridge respelled, because that is what a load is matched by', () => {
    expect(changes(gun({}, {}, '7,62 × 39'), gun({}, {}, '7,62 x 39'))).toEqual(['cartridge "7,62 × 39" → "7,62 x 39"']);
  });
});
