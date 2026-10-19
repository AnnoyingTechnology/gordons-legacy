import { describe, expect, it } from 'vitest';
import { difference, firearmRecord, labelled, length, mass, readableName, twist, withMaker } from '../../../tools/data/firearms/printed-figures.ts';

/**
 * The figures the American makers print, as `tools/data/firearms/printed-figures.ts` reads them (issue
 * #30). Colt, FN America, Girsan, Kel-Tec and Ed Brown all read their pages through this module, so a
 * mistake here is a mistake in five corpora at once — and the three it has already made are the cases
 * below: a choice of barrels taken for a figure (FN's SPR A5M, 2026-10-16), a label whose value is on
 * the next line taken from a different label (FN's M16A4), and a rifle sold in two cartridges whose two
 * twists would have become one.
 *
 * The strings are the shapes the makers write; the figures in them are made up.
 */
describe('a figure as an American maker prints it', () => {
  it('reads a length in either unit, keeping the one printed to the finer step', () => {
    expect(length('5 inch')).toBe(0.127);
    expect(length('120.5 mm')).toBe(0.1205);
    // One length in two units: a tenth of a millimetre says more than a tenth of an inch.
    expect(length('16.1" (408.9 mm)')).toBe(0.4089);
    expect(length('16.1"')).toBeCloseTo(0.40894, 10);
  });

  it('reads no length from a bare number or from a choice of two', () => {
    expect(length('16')).toBeUndefined();
    expect(length('20" or 24"')).toBeUndefined(); // which barrel the weight beside it belongs to is not said
    expect(length('16.1" (16.1")')).toBe(0.40894); // the same length twice is one length
  });

  it('reads a weight in pounds, ounces or kilograms, and pounds and ounces together', () => {
    expect(mass('41 OZ')).toBe(1.16233);
    expect(mass('5 lbs 13.1oz')).toBe(2.639341);
    expect(mass('6.6lbs (3.0kg)')).toBe(2.99371); // the pound is printed to the finer step here
  });

  it('reads no weight from a choice, and none that cannot be a gun', () => {
    expect(mass('11.3 lb. or 11.8 lb.')).toBeUndefined();
    expect(mass('9999 lbs')).toBeUndefined(); // Savage's placeholder for a weight they do not publish
    expect(mass('1.2 oz')).toBeUndefined(); // an accessory's weight is not a gun's
  });

  it('reads a turn of rifling with or without its unit', () => {
    expect(twist('1:7 RH, 6 Groove')).toBe(0.1778); // these makers print inches and often leave it out
    expect(twist('1 in 11"')).toBe(0.2794);
    expect(twist('1-10 Twist')).toBe(0.254);
    expect(twist('1:254 mm')).toBe(0.254);
  });

  it('reads no turn where the cell holds two of them, or a number rifling cannot be', () => {
    expect(twist('1:10" RH (.300); 1:12" RH (.308)')).toBeUndefined();
    expect(twist('1:2')).toBeUndefined();
    expect(twist('6 Groove')).toBeUndefined();
  });

  it('takes the value of a label, and nothing when that label has none', () => {
    expect(labelled(['Barrel Length', '3.6"'], 'Barrel Length')).toBe('3.6"');
    expect(labelled(['Barrel Length: 3.6"'], 'barrel length')).toBe('3.6"');
    // FN's M16A4 page: the empty label must not be filled from the next one, which is another figure.
    expect(labelled(['Barrel Length:', 'Overall Length: 39.63"'], 'Barrel Length')).toBeUndefined();
    expect(labelled(['Weight', '6.5 lbs'], 'Barrel Length')).toBeUndefined();
  });

  it('sets a name typeset in capitals in lower case, leaving model codes alone', () => {
    expect(readableName('ANACONDA (45 COLT, 6")')).toBe('Anaconda (45 Colt, 6")');
    expect(readableName('COMPACT MC BLACK')).toBe('Compact MC Black');
    expect(readableName('Colt  Python')).toBe('Colt Python'); // the maker's own typesetting is kept
  });

  it('puts the maker first in a name, once', () => {
    expect(withMaker('Colt', 'M4 Carbine')).toBe('Colt M4 Carbine');
    expect(withMaker('Colt', 'Colt Python')).toBe('Colt Python');
  });
});

const FACTS = {
  maker: 'Example',
  publisher: 'Example Firearms LLC',
  name: 'Example Carbine',
  cartridge: '.223 Rem',
  barrelLength: 0.4089,
  twistLength: 0.1778,
  url: 'https://example.invalid/carbine/',
  retrieved: '2026-10-19',
  published: { barrelLength: '16.1" (408.9 mm)', twist: '1:7', weight: '6.5 lbs' },
};

describe('the record every one of these extractors builds', () => {
  it('cites the page, the day and what the mass includes', () => {
    const record = firearmRecord({ ...FACTS, gunMass: 2.948851, massBasis: 'without-magazine' });
    expect(record.name).toBe('Example Carbine');
    expect(record.barrel.name).toBe('Example Carbine');
    expect(record.barrel.length).toBe(0.4089);
    expect(record.barrel.twistLength).toBe(0.1778);
    expect(record.barrel.gunMass).toBe(2.948851);
    expect(record.barrel.gasLeaks).toEqual([]);
    expect(record.source).toMatchObject({
      kind: 'published',
      publisher: 'Example Firearms LLC',
      url: 'https://example.invalid/carbine/',
      retrieved: '2026-10-19',
      massBasis: 'without-magazine',
    });
    expect(record.source?.published).toMatchObject({ barrelLength: '16.1" (408.9 mm)', twist: '1:7', weight: '6.5 lbs' });
  });

  it('says a mass is `unstated` where the page gives one without saying what it includes', () => {
    expect(firearmRecord({ ...FACTS, gunMass: 2.948851 }).source?.massBasis).toBe('unstated');
  });

  it('carries no mass basis where the page publishes no weight', () => {
    const record = firearmRecord(FACTS);
    expect(record.barrel.gunMass).toBeUndefined();
    expect(record.source?.massBasis).toBeUndefined(); // a gun with no published mass, not a gun of unknown mass
  });

  it('names what two listings of one gun disagree on, so neither is averaged into the other', () => {
    const written = firearmRecord({ ...FACTS, gunMass: 2.948851 });
    const second = firearmRecord({ ...FACTS, barrelLength: 0.4064, gunMass: 2.948851 });
    expect(difference(written, second)).toBe(', where the two pages disagree: barrel length 408.9 mm in the record, 406.4 mm on this page');
    expect(difference(written, written)).toBe('');
  });
});
