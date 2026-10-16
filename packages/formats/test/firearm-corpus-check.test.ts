import { describe, expect, it } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '../src/index.ts';
import { auditFirearm, loadableCartridge, printedLengths, printedMasses, printedTwists } from '../../../tools/data/firearms/check-corpus.ts';

/**
 * The check a crawl's output goes through before anything is published
 * (tools/data/firearms/check-corpus.ts, issue #30): every SI figure has to agree with the maker's own
 * printed string, no figure may be one no gun can have, every record has to say which page and which
 * day it comes from, and no gun may be one a reloader cannot load for. The records below are invented.
 */

/** A gun as an extractor writes one: figures in SI, the maker's own strings beside them. */
function record(barrel: Partial<Firearm['barrel']>, published: Record<string, string>, rest: Partial<Firearm> = {}): Firearm {
  const gun: Firearm = {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: 'Example 7',
    cartridge: '.308 Win.',
    barrel: { name: 'Example 7', length: 0.56, gasLeaks: [], ...barrel },
    source: { kind: 'published', publisher: 'Example Arms', url: 'https://example.invalid/7', retrieved: '2026-10-15', published },
    ...rest,
  };
  // A mass has to say what it includes; the records below are about the figures, not about that field.
  return gun.barrel.gunMass === undefined || gun.source?.kind !== 'published' || gun.source.massBasis !== undefined
    ? gun
    : { ...gun, source: { ...gun.source, massBasis: 'unstated' } };
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
    expect(auditFirearm(record({ length: 2.4 }, { barrelLength: '240 cm' }))).toEqual([
      'a barrel of 2400.0 mm is not a barrel',
    ]);
  });

  it('asks every record where it comes from', () => {
    const gun = record({ length: 0.56 }, { barrelLength: '56 cm (22")' });
    const { source: _noSource, ...withoutSource } = gun;
    expect(auditFirearm(withoutSource)).toEqual(['no published source, so no page and no date say where the figures come from']);
    const source = { kind: 'published' as const, publisher: '', retrieved: '2099-01-01', published: {} };
    expect(auditFirearm({ ...gun, source })).toEqual([
      'the source names no page (nothing)',
      'read on "2099-01-01", which is not a day that has passed',
      'the source names no publisher',
      "none of the maker's own strings were kept, so no figure can be checked",
    ]);
    // A published mass with no basis is the fault Astra put ahead of publishing anything.
    const massWithoutBasis = record({ length: 0.56, gunMass: 3.4 }, { weight: '3,4 kg' });
    const { massBasis: _noBasis, ...sourceWithoutBasis } = massWithoutBasis.source!;
    expect(auditFirearm({ ...massWithoutBasis, source: sourceWithoutBasis })).toEqual([
      'a mass that does not say what it includes; `unstated` is the honest value, not a missing field',
    ]);
  });

  it('refuses a gun a reloader cannot load for, however well it is documented', () => {
    expect(auditFirearm(record({ length: 0.46 }, { barrelLength: '46 cm' }, { cartridge: '.22 LR' }))).toEqual([
      '".22 LR" is not a cartridge a reloader loads',
    ]);
    expect(auditFirearm(record({ length: 0.71 }, { barrelLength: '71 cm' }, { cartridge: '12 Gauge' }))).toEqual([
      '"12 Gauge" is not a cartridge a reloader loads',
    ]);
    const { cartridge: _noCartridge, ...withoutCartridge } = record({ length: 0.56 }, { barrelLength: '56 cm' });
    expect(auditFirearm(withoutCartridge)).toEqual(['"no cartridge" is not a cartridge a reloader loads']);
    // The names that look alike are the point: these are centrefire, and stay. Every one of them is a
    // string a maker in this corpus prints, and the 232 others it holds pass.
    for (const cartridge of ['.22 Hornet', '.22-250 Rem', '.223 Rem', '.22 CRDMR', '.17 Remington', '204 Ruger', '.50/95']) {
      expect(loadableCartridge(cartridge)).toBe(true);
    }
    // These too are printed as they stand: Browning writes .17 Mach 2 as `17 M 2` and sells rifles for
    // Winchester's .21 Sharp, a rimfire of 2024 that no list of the old names would have caught.
    for (const cartridge of ['22 LR', '.22 Long Rifle', '22 S L LR', '22 WMR', '.22 Magnum', '17 HMR', '17 M 2', '21 SHARP', '20 GA', '.410 Bore']) {
      expect(loadableCartridge(cartridge)).toBe(false);
    }
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
    expect(printedTwists('1 in 12"')[0]).toBeCloseTo(0.3048, 12);
  });
});
