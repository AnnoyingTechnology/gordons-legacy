import { describe, expect, it } from 'vitest';
import type { Firearm } from '../src/index.ts';
import { productName, readPage, variants, variationFields } from '../../../tools/data/firearms/colt.ts';

/**
 * Reading a maker's published specifications (tools/data/firearms/colt.ts, issue #30). The pages below
 * are in the shape Colt's are — a WooCommerce product whose variants carry their figures in the
 * `data-product_variations` attribute of the form, each variant a block of keyed fields, and the simpler
 * page that sells one gun and prints `Caliber : 45 ACP` in its text. The figures are made up.
 *
 * What the shapes cost: a variant's figures must come from its own entry (one page sells the same
 * carbine with three barrels), the `Handguard` field prints a length that is not the barrel's, and the
 * WooCommerce `weight` of a variation is what the parcel weighs.
 */
const LABELS: Record<string, string> = { caliber: 'Caliber', barrel_length: 'Barrel Length', weight: 'Weight', rifling: 'Rifling', handguard: 'Handguard' };

function fieldBlocks(id: number, fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value], index) => `<div class="iconic-cffv-field" data-field-id="iconic_cffv_${id}${index}_${key}"><strong>${LABELS[key] ?? key}</strong> : ${value}</div>`)
    .join('');
}

/** The attribute as the page carries it: JSON with its quotes written as entities. */
function productVariations(entries: unknown[]): string {
  return JSON.stringify(entries).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const CARBINE = {
  attributes: { attribute_pa_variant: 'example-carbine-16-1-semi-auto' },
  weight: '7.2', // the parcel's weight, which WooCommerce keeps beside the gun's figures
  variation_fields: fieldBlocks(1, { caliber: '5.56 NATO', barrel_length: '16.1&#8221; (408.9 mm)', weight: '6.5 lbs (2.9 kg)', rifling: '1:7', handguard: '10.35&#8221;' }),
};
const SHORT_CARBINE = {
  attributes: { attribute_pa_variant: 'example-carbine-11-5-semi-auto' },
  variation_fields: fieldBlocks(2, { caliber: '5.56 NATO', barrel_length: '11.5&#8221; (292.1 mm)', weight: '6.0 lbs (2.7 kg)', rifling: '1:7' }),
};
const RIMFIRE = {
  attributes: { attribute_pa_variant: 'example-carbine-22' },
  variation_fields: fieldBlocks(3, { caliber: '.22 LR', barrel_length: '16.1&#8221; (408.9 mm)', rifling: '1:16' }),
};
const NO_BARREL = {
  attributes: { attribute_pa_variant: 'example-carbine-no-barrel' },
  variation_fields: fieldBlocks(4, { caliber: '5.56 NATO', rifling: '1:7' }),
};

const OPTIONS = `<select>
  <option value="example-carbine-16-1-semi-auto">EXAMPLE CARBINE (16.1&#8221;) SEMI AUTO</option>
  <option value="example-carbine-11-5-semi-auto">EXAMPLE CARBINE (11.5&#8221;) SEMI AUTO</option>
  <option value="example-carbine-22">EXAMPLE CARBINE (22 LR)</option>
  <option value="example-carbine-no-barrel">EXAMPLE CARBINE (NO BARREL PRINTED)</option>
</select>`;

const VARIANT_PAGE = `<html><head><title>Example Carbine - Colt&#8217;s Manufacturing Company LLC</title></head><body>
${OPTIONS}
<form data-product_variations="${productVariations([CARBINE, SHORT_CARBINE, RIMFIRE, NO_BARREL])}"></form>
</body></html>`;

const ONE_GUN_PAGE = `<html><head><title>Example Gold Cup - Colt&#8217;s Manufacturing Company LLC</title></head><body>
<ul><li>Caliber : 45 ACP</li><li>Barrel Length : 4.25&#8221; (108.0 mm)</li><li>Capacity : 8+1</li></ul>
</body></html>`;

const URL = 'https://example.invalid/detail-page/example-carbine/';

/** The guns one page gave, by name; the reasons are checked apart. */
function gunsOf(page: string): Map<string, Firearm> {
  return new Map(readPage(page, URL, '2026-10-19').flatMap((reading) => ('firearm' in reading ? [[reading.firearm.name, reading.firearm] as const] : [])));
}

function reasonsOf(page: string): string[] {
  return readPage(page, URL, '2026-10-19').flatMap((reading) => ('skipped' in reading ? [reading.skipped] : []));
}

describe('reading a published specification', () => {
  it('reads the keyed fields of a variant, without their labels', () => {
    const fields = variationFields(fieldBlocks(1, { caliber: '45 ACP', barrel_length: '5&#8221; (127.0 mm)' }));
    expect(fields.get('caliber')).toBe('45 ACP');
    expect(fields.get('barrel_length')).toBe('5" (127.0 mm)'); // the typographic inch mark in the spelling every reader looks for
    expect(fields.get('rifling')).toBeUndefined();
  });

  it('reads one entry per variant, each with the option the page names it by', () => {
    const sold = variants(VARIANT_PAGE);
    expect(sold).toHaveLength(4);
    expect(sold[0]!.option).toBe('EXAMPLE CARBINE (16.1") SEMI AUTO');
    expect(sold[0]!.fields.get('barrel_length')).toBe('16.1" (408.9 mm)');
    expect(sold[1]!.fields.get('barrel_length')).toBe('11.5" (292.1 mm)');
    expect(variants(ONE_GUN_PAGE)).toEqual([]); // a page that sells one gun carries no variations
  });

  it('names the product without the company it belongs to', () => {
    expect(productName(VARIANT_PAGE)).toBe('Example Carbine');
    expect(productName('<html><body>no title</body></html>')).toBeUndefined();
  });

  it('writes one gun per variant, from its own entry', () => {
    const guns = gunsOf(VARIANT_PAGE);
    const long = guns.get('Colt Example Carbine (16.1") Semi Auto');
    const short = guns.get('Colt Example Carbine (11.5") Semi Auto');
    expect(long?.cartridge).toBe('5.56 NATO');
    expect(long?.barrel.length).toBe(0.4089); // the millimetre is printed to the finer step
    expect(long?.barrel.twistLength).toBeCloseTo(0.1778, 10);
    expect(long?.barrel.gunMass).toBe(2.94835); // 6.5 lbs: a tenth of a pound says more than the 2.9 kg beside it
    expect(short?.barrel.length).toBe(0.2921);
    expect(short?.barrel.gunMass).toBe(2.721554);
    expect(long?.source?.published).toMatchObject({ caliber: '5.56 NATO', barrelLength: '16.1" (408.9 mm)', weight: '6.5 lbs (2.9 kg)', twist: '1:7' });
  });

  it('takes the barrel length from the barrel field and no other', () => {
    // The `Handguard` field of the same variant prints 10.35", which is not a barrel length.
    expect(gunsOf(VARIANT_PAGE).get('Colt Example Carbine (16.1") Semi Auto')?.barrel.length).not.toBeCloseTo(0.262890, 5);
  });

  it('never reads the parcel weight WooCommerce keeps beside the figures', () => {
    // The entry's own `weight` is 7.2 lbs of packed carbine; the gun's is the 6.5 lbs of its field.
    expect(gunsOf(VARIANT_PAGE).get('Colt Example Carbine (16.1") Semi Auto')?.barrel.gunMass).toBeLessThan(3);
  });

  it('reads a single-gun page from the labels in its text, and leaves the mass out where none is published', () => {
    const gun = gunsOf(ONE_GUN_PAGE).get('Colt Example Gold Cup');
    expect(gun?.cartridge).toBe('45 ACP');
    expect(gun?.barrel.length).toBe(0.108);
    expect(gun?.barrel.gunMass).toBeUndefined(); // Colt publishes no weight for their pistols
    expect(gun?.barrel.twistLength).toBeUndefined();
  });

  it('leaves out a variant with no barrel length, and a rimfire, saying which and why', () => {
    const reasons = reasonsOf(VARIANT_PAGE);
    expect(reasons).toContain('EXAMPLE CARBINE (NO BARREL PRINTED): no barrel length printed');
    expect(reasons).toContain('EXAMPLE CARBINE (22 LR): no loadable cartridge (.22 LR)');
    expect(reasonsOf('<html><body>an accessory</body></html>')).toEqual(['no title']);
  });
});
