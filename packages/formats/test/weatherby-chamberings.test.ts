import { describe, expect, it } from 'vitest';
import type { Firearm } from '../src/index.ts';
import { barrelLength, columnOf, gunMass, tablesOf, twistLength } from '../../../tools/data/firearms/rifle-figures.ts';
import { modelFromTitle, productLinks, readPage } from '../../../tools/data/firearms/weatherby.ts';

/**
 * Reading a model's chamberings (tools/data/firearms/rifle-figures.ts, weatherby.ts, issue #30): these
 * makers publish one product page per model with a table whose every row is a gun — a cartridge, a
 * weight, a barrel and a twist.
 *
 * The page below has the shape of the maker's own, and its figures are made up. Four of its rows are
 * the cases that cost a reading: a barrel with a muzzle brake counted into the length (the maker's own
 * spelling is `break` on about a third of their pages), a weight printed as a range, a rimfire nobody
 * reloads, and one cartridge offered with two barrels — which is two guns, not one listed twice. The
 * WooCommerce "Additional information" table is there because its `Weight` is what the parcel weighs,
 * and it must never become a gun's mass.
 */
const CHAMBERINGS = [
  ['.257 Wby Mag', '6.8lbs.', '46"', '26"', '1:10"'],
  ['6.5 Creedmoor', '6.5lbs.', '42"', '22" (20" barrel + 2" muzzle break)', '1:8"'],
  ['.22 LR', '5.5lbs.', '40"', '20"', '1:16"'],
  ['.300 Wby Mag', '7.0lbs.', '46"', '26"', '1:10"'],
  ['.300 Wby Mag', '7.4lbs.', '48"', '28"', '1:10"'],
  ['.308 Win', '5.8 lbs to 6.4 lbs', '42"', '22"', '1:10"'],
  ['.257 Wby Mag', '6.8lbs.', '46"', '26"', '1:10"'],
];

function table(header: string[], rows: string[][]): string {
  const cells = (row: string[], tag: string) => row.map((cell) => `<${tag}>${cell}</${tag}>`).join('');
  return `<table><tbody><tr>${cells(header, 'th')}</tr>${rows.map((row) => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table>`;
}

const PAGE = `<html><head><title>Weatherby Mark V&reg; Example Hunter &#8211; Weatherby, Inc.</title></head><body>
<h2>Technical information on each Mark V Example Hunter chambering</h2>
${table(['Caliber', 'Weight', 'Overall Length', 'Barrel OAL', 'Twist Rate'], CHAMBERINGS)}
<h2>Additional information</h2>
${table(['Additional information', ''], [['Weight', '9 lbs'], ['Dimensions', '50 × 8 × 3 in']])}
</body></html>`;

const URL = 'https://example.invalid/store/markv-example-hunter/';

/** The guns one page gave, by name; the reasons are checked apart. */
function gunsOf(page: string): Map<string, Firearm> {
  const guns = new Map<string, Firearm>();
  for (const reading of readPage(page, URL, '2026-10-19')) if ('firearm' in reading) guns.set(reading.firearm.name, reading.firearm);
  return guns;
}

function reasonsOf(page: string): string[] {
  return readPage(page, URL, '2026-10-19').flatMap((reading) => ('skipped' in reading ? [reading.skipped] : []));
}

describe('a figure in a chambering table', () => {
  it('reads a barrel length, and takes the barrel out of a length a muzzle brake is counted into', () => {
    expect(barrelLength('26"')).toEqual({ value: 0.6604, step: 0.0254 });
    expect(barrelLength('22" (20" barrel + 2" muzzle break)')?.value).toBeCloseTo(0.508, 10);
    expect(barrelLength('26" (660 mm)')).toEqual({ value: 0.66, step: 0.001 }); // the finer of the two
    expect(barrelLength('24" with brake')).toBeUndefined(); // how much of it is barrel is not said
    expect(barrelLength('20" or 24"')).toBeUndefined();
  });

  it('reads a weight in pounds, ounces or kilograms, and none from a range', () => {
    expect(gunMass('6.8lbs.')?.value).toBeCloseTo(3.084428, 6);
    expect(gunMass('7lb 10.9oz')?.value).toBeCloseTo(3.484156, 6); // pounds and ounces are one figure
    expect(gunMass('5.8 lbs to 6.4 lbs')).toBeUndefined();
    expect(gunMass('configuration dependent')).toBeUndefined();
    expect(gunMass('9999 lbs')).toBeUndefined(); // not a mass a person carries
  });

  it('reads a turn of rifling, and none where the cell holds two', () => {
    expect(twistLength('1:10"')).toBeCloseTo(0.254, 10);
    expect(twistLength('1-8')).toBeCloseTo(0.2032, 10); // no unit: these makers print inches
    expect(twistLength('1:178 mm')).toBeCloseTo(0.178, 10);
    expect(twistLength('1:7 to 1:10')).toBeUndefined();
  });

  it('finds the tables of a page and the column a label heads', () => {
    const tables = tablesOf(PAGE);
    expect(tables).toHaveLength(2);
    expect(tables[0]!.header).toEqual(['Caliber', 'Weight', 'Overall Length', 'Barrel OAL', 'Twist Rate']);
    expect(tables[0]!.rows).toHaveLength(CHAMBERINGS.length);
    expect(columnOf(tables[0]!, /^barrel (oal|length)/i)).toBe(3);
    expect(columnOf(tables[0]!, /^caliber$/i)).toBe(0);
    expect(columnOf(tables[1]!, /^caliber$/i)).toBe(-1); // the parcel's table is not a chambering table
  });
});

describe('the guns of a product page', () => {
  // The ® the maker prints on one page and leaves off the next is not part of a name: it would put
  // the same gun in the corpus twice (maker-site.ts, plainText).
  it('names the model from the page title, without the maker or its trade marks', () => {
    expect(modelFromTitle(PAGE)).toBe('Mark V Example Hunter');
    expect(modelFromTitle('<title>Vanguard&reg; Example - Weatherby, Inc.</title>')).toBe('Vanguard Example');
    expect(modelFromTitle('<html><body>no title</body></html>')).toBeUndefined();
  });

  it('writes one gun per chambering, with the maker, the page and the day on each', () => {
    const gun = gunsOf(PAGE).get('Weatherby Mark V Example Hunter .257 Wby Mag');
    expect(gun?.maker).toBe('Weatherby');
    expect(gun?.model).toBe('Mark V Example Hunter');
    expect(gun?.cartridge).toBe('.257 Wby Mag');
    expect(gun?.barrel.length).toBeCloseTo(0.6604, 10);
    expect(gun?.barrel.twistLength).toBeCloseTo(0.254, 10);
    expect(gun?.barrel.gunMass).toBeCloseTo(3.084428, 6);
    expect(gun?.source).toMatchObject({ kind: 'published', publisher: 'Weatherby, Inc.', url: URL, retrieved: '2026-10-19', massBasis: 'unstated' });
    // The maker's own strings, so a rounding or a unit can be checked without fetching the page again.
    expect(gun?.source?.published).toMatchObject({ barrelLength: '26"', weight: '6.8lbs.', twist: '1:10"' });
  });

  it('takes the barrel out of a length that includes the muzzle brake', () => {
    expect(gunsOf(PAGE).get('Weatherby Mark V Example Hunter 6.5 Creedmoor')?.barrel.length).toBeCloseTo(0.508, 10);
  });

  it('puts the barrel in the name where one cartridge is offered with two of them', () => {
    const names = [...gunsOf(PAGE).keys()].filter((name) => name.includes('.300 Wby Mag'));
    expect(names).toEqual(['Weatherby Mark V Example Hunter .300 Wby Mag 26"', 'Weatherby Mark V Example Hunter .300 Wby Mag 28"']);
  });

  it('keeps a gun whose weight is a range, without a mass rather than with a guessed one', () => {
    const gun = gunsOf(PAGE).get('Weatherby Mark V Example Hunter .308 Win');
    expect(gun?.barrel.length).toBeCloseTo(0.5588, 10);
    expect(gun?.barrel.gunMass).toBeUndefined();
    expect(gun?.source?.massBasis).toBeUndefined();
    expect(gun?.source?.published).toMatchObject({ weight: '5.8 lbs to 6.4 lbs' }); // what the page says, kept
  });

  it('leaves out a rimfire, and never takes the parcel weight for the gun', () => {
    const guns = gunsOf(PAGE);
    expect([...guns.keys()].some((name) => name.includes('.22 LR'))).toBe(false);
    expect(reasonsOf(PAGE)).toContain('.22 LR: not a cartridge a reloader loads');
    expect([...guns.values()].map((gun) => gun.barrel.gunMass)).not.toContain(gunMass('9 lbs')?.value);
  });

  it('lists one cartridge listed twice with the same figures once, and says nothing about it', () => {
    expect([...gunsOf(PAGE).keys()].filter((name) => name.includes('.257 Wby Mag'))).toHaveLength(1);
    expect(reasonsOf(PAGE).filter((reason) => reason.includes('.257'))).toEqual([]);
  });

  it('says what two listings of one gun disagree on instead of choosing between them', () => {
    const listedTwice = `<html><head><title>Example Model &#8211; Weatherby, Inc.</title></head><body>
      ${table(['Caliber', 'Weight', 'Barrel OAL', 'Twist Rate'], [['.308 Win', '6.8lbs.', '22"', '1:10"'], ['.308 Win', '7.2lbs.', '22"', '1:10"']])}</body></html>`;
    expect(reasonsOf(listedTwice)).toEqual(['.308 Win 22": listed twice with different figures; only the first is kept']);
    expect(gunsOf(listedTwice).size).toBe(1);
  });

  it('says a page gave nothing, so that a parser which has stopped working is not read as an empty catalogue', () => {
    expect(reasonsOf('<html><head><title>Example &#8211; Weatherby, Inc.</title></head><body>no table</body></html>')).toEqual([
      'no gun with a cartridge and a barrel length',
    ]);
    expect(reasonsOf('<html><body>no title at all</body></html>')).toEqual(['no title']);
  });
});

describe('the product pages of a category', () => {
  it('lists each rifle once, without its fragments, and leaves the shotguns out', () => {
    const page = `<a href="https://weatherby.com/store/markv-example/">Mark V</a>
      <a href="https://weatherby.com/store/markv-example/#specs">Specifications</a>
      <a href="https://weatherby.com/store/vanguard-example/">Vanguard</a>
      <a href="https://weatherby.com/store/orion-example/">Orion</a>
      <a href="https://weatherby.com/ammunition/example/">Ammunition</a>`;
    expect(productLinks(page)).toEqual(['https://weatherby.com/store/markv-example/', 'https://weatherby.com/store/vanguard-example/']);
  });
});
