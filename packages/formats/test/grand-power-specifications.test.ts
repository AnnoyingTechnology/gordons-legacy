import { describe, expect, it } from 'vitest';
import { firearmFrom, labelledValues, length, mass, modelFromTitle, twistLength } from '../../../tools/data/firearms/grand-power.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/grand-power.ts, issue #30). The
 * pages below are written here in the shape the maker's pages have, a short list of labelled values under
 * the product title, and the figures are made up.
 */

function item(label: string, value: string): string {
  return `<li><strong style="color: #b3a168;">${label}:</strong><em>${value}</em></li>`;
}

function page(title: string, items: [string, string][]): string {
  return `<html><body><h1 class="product_title entry-title">${title}</h1><ul class="trx_addons_list_parameters">${items.map(([label, value]) => item(label, value)).join('')}</ul></body></html>`;
}

const PISTOL = page('Example P9', [
  ['Caliber', '9mm Luger'],
  ['Trigger pull weight', '16N'],
  ['Barrel length', '96 mm'],
  ['Weight w/ empty magazine', '700 g'],
  ['Weight w/o magazine', '640 g'],
]);

describe('reading a published specification', () => {
  it('reads the labelled list and the title', () => {
    const values = labelledValues(PISTOL);
    expect(values.get('caliber')).toBe('9mm Luger');
    expect(values.get('barrel length')).toBe('96 mm');
    expect(modelFromTitle(PISTOL)).toBe('Example P9');
  });

  it('reads metric lengths with either decimal mark, inches, and refuses a list', () => {
    expect(length('96 mm')).toBeCloseTo(0.096, 12);
    expect(length('5,2 cm')).toBeCloseTo(0.052, 12);
    expect(length('4.5"')).toBeCloseTo(0.1143, 9);
    expect(length('11" / 14.5"')).toBeUndefined();
    expect(length('N / A')).toBeUndefined();
  });

  it('reads grams with or without a space, and kilograms', () => {
    expect(mass('680 g')).toBeCloseTo(0.68, 12);
    expect(mass('2800g')).toBeCloseTo(2.8, 12);
    expect(mass('1,2 kg')).toBeCloseTo(1.2, 12);
    expect(mass('8.5 lbs')).toBeUndefined();
  });

  it('takes a bare 1:8 as inches, and refuses a bare number no inch twist could be', () => {
    expect(twistLength('1:8')).toBeCloseTo(0.2032, 12);
    expect(twistLength('1:203 mm')).toBeCloseTo(0.203, 12);
    expect(twistLength('1:203')).toBeUndefined();
  });


  it('builds a gun with the weight that includes an empty magazine, whatever order the page lists them in', () => {
    const gun = firearmFrom(PISTOL, 'https://example.invalid/products/example-p9/', '2026-10-16')!;
    expect(gun.name).toBe('Grand Power Example P9');
    expect(gun.barrel.length).toBeCloseTo(0.096, 12);
    expect(gun.barrel.gunMass).toBeCloseTo(0.7, 12);
    expect(gun.source).toEqual({
      kind: 'published',
      publisher: 'Grand Power',
      url: 'https://example.invalid/products/example-p9/',
      retrieved: '2026-10-16',
      massBasis: 'empty-magazine',
      published: { caliber: '9mm Luger', barrelLength: '96 mm', weight: '700 g' },
    });
  });

  it('says the basis is unstated when the label only says Weight, and never reads the trigger pull', () => {
    const gun = firearmFrom(page('Example P', [['Caliber', '.45 ACP'], ['Trigger pull weight', '20N'], ['Barrel length', '108 mm'], ['Weight', '750 g']]), 'u', '2026-10-16')!;
    expect(gun.barrel.gunMass).toBeCloseTo(0.75, 12);
    expect(gun.source?.massBasis).toBe('unstated');
    const forceOnly = firearmFrom(page('Example Q', [['Caliber', '.45 ACP'], ['Trigger pull weight', '20 N'], ['Barrel length', '108 mm']]), 'u', '2026-10-16')!;
    expect(forceOnly.barrel.gunMass).toBeUndefined();
  });

  it('leaves out a page with several barrel lengths, or calibers of two bores', () => {
    expect(firearmFrom(page('Example R', [['Caliber', '.223 Remington'], ['Barrel length', '11" / 14.5" / 16.5"'], ['Weight', '2800g']]), 'u', '2026-10-16')).toBeUndefined();
    expect(firearmFrom(page('Example S', [['Caliber', '9mm Luger / .45 Auto'], ['Barrel length', '108 mm']]), 'u', '2026-10-16')).toBeUndefined();
    // Two cases of one bore are one gun, and the cell stays as the maker printed it.
    const oneBore = firearmFrom(page('Example T', [['Caliber', '.40 S&W / 10mm AUTO'], ['Barrel length', '108 mm']]), 'u', '2026-10-16')!;
    expect(oneBore.cartridge).toBe('.40 S&W / 10mm AUTO');
  });

  it('reads the twist of a rifle and keeps the maker\'s strings', () => {
    const gun = firearmFrom(page('Example R15', [['Caliber', '.223 Remington'], ['Barrel length', '16.5"'], ['Twist rate', '1:8'], ['Weight w/o magazine', '2800g']]), 'u', '2026-10-16')!;
    expect(gun.barrel.twistLength).toBeCloseTo(0.2032, 12);
    expect(gun.source?.massBasis).toBe('without-magazine');
    expect(gun.source?.published).toEqual({ caliber: '.223 Remington', barrelLength: '16.5"', weight: '2800g', twist: '1:8' });
  });
});
