import { describe, expect, it } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '../src/index.ts';
import { auditFirearm, printedLengths, printedMasses, printedTwists } from '../../../tools/data/firearms/check-corpus.ts';

/**
 * The check a crawl's output goes through before anything is published
 * (tools/data/firearms/check-corpus.ts, issue #30): every SI figure has to agree with the maker's own
 * printed string, and no figure may be one no gun can have. The records below are invented.
 */

/** A gun as an extractor writes one: figures in SI, the maker's own strings beside them. */
function record(barrel: Partial<Firearm['barrel']>, published: Record<string, string>): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: 'Example 7',
    cartridge: '.308 Win.',
    barrel: { name: 'Example 7', length: 0.56, gasLeaks: [], ...barrel },
    source: { kind: 'published', publisher: 'Example Arms', url: 'https://example.invalid/7', retrieved: '2026-10-15', published },
  };
}

describe('checking a crawl before it is published', () => {
  it('passes a record whose figures are what the maker printed', () => {
    const gun = record({ length: 0.56, gunMass: 3.4, twistLength: 0.254 }, { barrelLength: '56 cm (22")', weight: '3,4 kg (7.5 lbs)', twist: '1:10"' });
    expect(auditFirearm(gun)).toEqual([]);
  });

  it('catches a centimetre read as a millimetre', () => {
    const gun = record({ length: 0.056 }, { barrelLength: '56 cm (22")' });
    expect(auditFirearm(gun)).toEqual(['barrel 56.0 mm, where the maker printed "56 cm (22")"']);
  });

  it('catches a pound read as a kilogram, and a twist read in the wrong unit', () => {
    const gun = record({ length: 0.56, gunMass: 7.5, twistLength: 0.01 }, { weight: '3,4 kg (7.5 lbs)', twist: '1:10"' });
    expect(auditFirearm(gun)).toEqual([
      'a turn of 10.0 mm is not a twist',
      'mass 7.500 kg, where the maker printed "3,4 kg (7.5 lbs)"',
      'twist 10.0 mm, where the maker printed "1:10""',
    ]);
  });

  it("refuses a figure no gun can have, whatever the page printed", () => {
    const placeholder = record({ length: 0.508, gunMass: 4535.47 }, { weight: '9999 lbs (4535.47 kg)' });
    expect(auditFirearm(placeholder)).toEqual(['a gun of 4535.470 kg is not a gun']);
    expect(auditFirearm(record({ length: 2.4 }, {}))).toEqual(['a barrel of 2400.0 mm is not a barrel']);
  });

  it('reads a printed figure as its maker writes it, with either decimal mark', () => {
    expect(printedLengths('56 cm (22")')).toEqual([0.56, 0.5588]);
    expect(printedLengths('508 mm')).toEqual([0.508]);
    // Smith & Wesson print a barrel length with no unit at all; their own prose repeats it in inches.
    expect(printedLengths('4.22')[0]).toBeCloseTo(0.107188, 12);
    expect(printedMasses('3,4 kg (7.5 lbs)')[0]).toBeCloseTo(3.4, 12);
    expect(printedMasses('6 lbs. 2 oz.').at(-1)).toBeCloseTo(2.77825, 5);
    expect(printedMasses('705 g | 24.87 oz')[0]).toBeCloseTo(0.705, 12);
    expect(printedTwists('1:9,5"')[0]).toBeCloseTo(0.2413, 12);
    expect(printedTwists('1 : 9,5 / 4')[0]).toBeCloseTo(0.2413, 12);
    expect(printedTwists('1:203 mm')[0]).toBeCloseTo(0.203, 12);
  });
});
