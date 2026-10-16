import { describe, expect, it } from 'vitest';
import { units } from '../src/index.ts';
import {
  barrelLength,
  completeGun,
  difference,
  firearmFrom,
  gunMass,
  productPage,
  readableName,
  twistLength,
} from '../../../tools/data/firearms/smith-wesson.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/smith-wesson.ts, issue #30).
 * The pages below are written here in the shape the maker's pages have — a `__NEXT_DATA__` script that
 * carries the product as JSON — and their text is not reproduced: the names, the description and the
 * figures are made up.
 */

interface PageContent {
  name: string;
  description?: string;
  specifications: [string, string][];
  dimensions?: string;
}

/** A product page in the shape of the maker's: the JSON the page embeds, inside a script. */
function pageWith(content: PageContent): string {
  const data = {
    props: {
      pageProps: {
        data: { name: content.name, description: content.description ?? '' },
        customfields: {
          array: { data: content.specifications.map(([name, value], id) => ({ id, name, value })) },
          object: content.dimensions === undefined ? {} : { customDimensions: content.dimensions },
        },
        // Related products carry their own descriptions, which must not be taken for this gun's.
        related: [{ description: '<ul><li>1:99” twist, another gun</li></ul>' }],
      },
    },
  };
  return `<html><head><title>${content.name}</title></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const PISTOL: PageContent = {
  name: 'TEST&amp;P®9 SAMPLE 2.0® FULL SIZE 15RD',
  description: '<p>Invented sentence.</p>\n<ul>\n<li>4.20&rdquo; 1:10&rdquo; twist stainless steel barrel</li>\n</ul>',
  specifications: [
    ['CALIBER', '9MM'],
    ['CAPACITY', '15'],
    ['ACTION', 'STRIKER FIRED'],
    ['BARREL LENGTH', '4.2'],
    ['MODEL', 'TEST&P 2.0'],
  ],
  dimensions: '<span>WEIGHT</span>&nbsp;&nbsp;29 oz<br /><span>WIDTH</span>&nbsp;&nbsp;1.2 in<br />',
};

const URL = 'https://example.invalid/product/test-pistol';

describe('reading a published specification', () => {
  it('finds the product in the JSON the page embeds', () => {
    const product = productPage(pageWith(PISTOL));
    // The marks the maker prints are left out of the record (tools/data/firearms/maker-site.ts).
    expect(product!.name).toBe('TEST&P9 SAMPLE 2.0 FULL SIZE 15RD');
    expect(product!.specifications.get('CALIBER')).toBe('9MM');
    expect(product!.specifications.get('BARREL LENGTH')).toBe('4.2');
    expect(productPage('<html>no data here</html>')).toBeUndefined();
  });

  it('reads the barrel length as inches, written or not, and nothing else', () => {
    expect(barrelLength('4.2')).toBeCloseTo(4.2 * units.INCH, 12);
    expect(barrelLength('16')).toBeCloseTo(0.4064, 12);
    expect(barrelLength('5 in')).toBeCloseTo(0.127, 12);
    expect(barrelLength('120 mm')).toBeUndefined();
    expect(barrelLength('4.2 / 5')).toBeUndefined();
    // Too long or too short to be inches: a different unit, which is not guessed at.
    expect(barrelLength('120')).toBeUndefined();
    expect(barrelLength('0.2')).toBeUndefined();
    expect(barrelLength(undefined)).toBeUndefined();
  });

  it('reads the mass where its unit is written', () => {
    expect(gunMass('<span>WEIGHT</span>&nbsp;&nbsp;29 oz<br /><span>WIDTH</span> 1.2 in')).toBeCloseTo(0.82213, 4);
    expect(gunMass('WEIGHT 6.5 lb')).toBeCloseTo(2.9484, 4);
    expect(gunMass('WEIGHT 29')).toBeUndefined();
    expect(gunMass('WIDTH 1.2 in')).toBeUndefined();
  });

  it('reads the twist from the description, with its unit', () => {
    expect(twistLength('<li>4.2&rdquo; 1:10&rdquo; twist barrel</li>')).toBeCloseTo(0.254, 12);
    expect(twistLength('<li>a barrel with 1:7.5 Twist, rifled</li>')).toBeCloseTo(7.5 * units.INCH, 12);
    expect(twistLength('<li>1:10-inch twist rate</li>')).toBeCloseTo(0.254, 12);
    expect(twistLength('<li>no rate given</li>')).toBeUndefined();
    expect(twistLength('<li>a 1:2 twist</li>')).toBeUndefined();
  });


  it('tells a complete gun from a part or a set', () => {
    const gun = productPage(pageWith(PISTOL))!;
    expect(completeGun(gun)).toBe(true);
    expect(completeGun({ ...gun, name: 'TEST&P®9 SAMPLE SLIDE KIT' })).toBe(false);
    expect(completeGun({ ...gun, name: 'TEST&P®9 SAMPLE CARRY ON BUNDLE' })).toBe(false);
    // A threaded barrel is a feature of a whole gun.
    expect(completeGun({ ...gun, name: 'TEST&P®9 SAMPLE THREADED BARREL' })).toBe(true);
    // An upper receiver has a caliber and a barrel length, but no action and no capacity.
    const upper = productPage(pageWith({ name: 'SAMPLE 16" UPPER', specifications: [['CALIBER', '5.56 NATO'], ['BARREL LENGTH', '16']] }))!;
    expect(completeGun(upper)).toBe(false);
  });

  it('sets a name written in capitals in lower case, but not its abbreviations', () => {
    expect(readableName('TEST&P®9 SAMPLE 2.0® FULL SIZE 15RD')).toBe('TEST&P9 Sample 2.0 Full Size 15RD');
    expect(readableName('[DISCONTINUED]MODEL 12® Revolver')).toBe('MODEL 12 Revolver');
    expect(readableName('Model 12 Revolver')).toBe('Model 12 Revolver');
    expect(readableName('S&W® SAMPLE 9 FDE')).toBe('Sample 9 FDE');
  });

  it('builds a gun with its mass, its twist and where the figures come from', () => {
    const firearm = firearmFrom(pageWith(PISTOL), URL, '2026-10-15');
    expect(firearm).toBeDefined();
    expect(firearm!.name).toBe('Smith & Wesson TEST&P9 Sample 2.0 Full Size 15RD');
    expect(firearm!.maker).toBe('Smith & Wesson');
    expect(firearm!.model).toBe('TEST&P 2.0');
    // The maker writes `9MM`; the application compares names, so the conventional one is used.
    expect(firearm!.cartridge).toBe('9x19 mm');
    expect(firearm!.barrel.length).toBeCloseTo(0.10668, 12);
    expect(firearm!.barrel.gunMass).toBeCloseTo(0.82213, 4);
    // The page's own description, not the related product's 1:99.
    expect(firearm!.barrel.twistLength).toBeCloseTo(0.254, 12);
    expect(firearm!.source).toEqual({
      kind: 'published',
      publisher: 'Smith & Wesson Brands, Inc.',
      url: URL,
      retrieved: '2026-10-15',
      // One weight, with nothing said about what it covers; and their own words for the cartridge,
      // kept beside the conventional name the record carries.
      massBasis: 'unstated',
      published: { caliber: '9MM', barrelLength: '4.2', weight: '29 oz', twist: '1:10" twist' },
    });
  });

  it('keeps a gun whose mass or twist is not published, without them', () => {
    const { dimensions: _unused, ...withoutDimensions } = PISTOL;
    const bare = { ...withoutDimensions, description: '<p>Nothing about the rifling.</p>' };
    const firearm = firearmFrom(pageWith(bare), URL, '2026-10-15');
    expect(firearm!.barrel.length).toBeCloseTo(0.10668, 12);
    expect(firearm!.barrel.gunMass).toBeUndefined();
    expect(firearm!.barrel.twistLength).toBeUndefined();
  });

  it('leaves out what a reloader cannot load for, and what is not a gun', () => {
    const rimfire = { ...PISTOL, specifications: PISTOL.specifications.map(([name, value]): [string, string] => [name, name === 'CALIBER' ? '22 LR' : value]) };
    expect(firearmFrom(pageWith(rimfire), URL, '2026-10-15')).toBeUndefined();
    const slide = { ...PISTOL, name: 'TEST&P®9 SAMPLE SLIDE KIT' };
    expect(firearmFrom(pageWith(slide), URL, '2026-10-15')).toBeUndefined();
    const shirt = { name: 'SAMPLE LOGO TEE', specifications: [] };
    expect(firearmFrom(pageWith(shirt), URL, '2026-10-15')).toBeUndefined();
  });

  it('says what two listings of one gun disagree on, so the second is skipped and not merged', () => {
    const first = firearmFrom(pageWith(PISTOL), URL, '2026-10-15')!;
    const lighter = { ...PISTOL, dimensions: '<span>WEIGHT</span> 20.0 oz' };
    const second = firearmFrom(pageWith(lighter), `${URL}-again`, '2026-10-15')!;
    expect(difference(first, second)).toBe(
      `, where the two pages disagree: weight ${(first.barrel.gunMass! * 1000).toFixed(1)} g in the record, 567.0 g on this page`,
    );
    expect(difference(first, first)).toBe('');
  });
});
