import { describe, expect, it } from 'vitest';
import { cartridgesOf, firearmsFrom, massBasisOf, productPages, tabs } from '../../../tools/data/firearms/steyr.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/steyr.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — a tab per variant, tied to its figures by
 * the tab number — and its text is not reproduced; the figures are made up.
 */

function options(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `<div class='option-item'><div class='option-name'>${name}</div><div class='option-value'>${value}</div></div>`)
    .join('');
}

const PAGE = `<html><body><div class='weapon-specifications'><h2>Specifications</h2>
<div class='weapon-specifications-tabs-navi'>
<div class='weapon-specifications-tab-name is-active' data-tab='0'></div>
<div class='weapon-specifications-tab-name' data-tab='1'>STEYR EXAMPLE Mountain</div>
<div class='weapon-specifications-tab-name' data-tab='2'>STEYR EXAMPLE Long</div>
<div class='weapon-specifications-tab-name' data-tab='3'>STEYR EXAMPLE Scout</div>
<div class='weapon-specifications-tab-name' data-tab='4'>STEYR EXAMPLE Pistol</div></div>
<div class='weapon-specifications-tabs'>
<div class='weapon-specifications-tab-options is-active' data-tab='0'></div>
<div class='weapon-specifications-tab-options' data-tab='1'>${options({ Caliber: '.308 Win., 6,5&#215;55 SE, 22 Long Rifle', 'Barrel Length': '508 mm / 20&#8243;', Weight: 'approx. 3,35 kg / 7.45 lbs', 'Twist rate': '1:12' })}</div>
<div class='weapon-specifications-tab-options' data-tab='2'>${options({ Caliber: '.308 Win.', 'Barrel Length': '508 mm (20&#8243;) 600 mm (23,6&#8243;)', Weight: '3,8 kg (8,4lbs)' })}</div>
<div class='weapon-specifications-tab-options' data-tab='3'>${options({ Caliber: '6,5 Creedmoor', 'Barrel Length': '485mm / 19&#8243;', Weight: '3,0 kg / 6.6 lbs without magazines', 'Twist rate': '1 turn right in 7,9&#8243;' })}</div>
<div class='weapon-specifications-tab-options' data-tab='4'>${options({ Caliber: '9&#215;19', 'Barrel Length': '115 mm / 4,5&#8243;', Weight: 'With empty magazine: 787 g / 27.76 oz<br>Weight empty magazine: 89g / 3.14 oz' })}</div>
</div></div></body></html>`;

const URL = 'https://example.invalid/en/hunting-rifles/example/';

describe('reading a published specification', () => {
  it('lists the rifle and pistol pages of a sitemap, not the category pages or the military copies', () => {
    const sitemap = [
      '/en/hunting-rifles/example/',
      '/en/hunting-rifles/',
      '/en/pistols/example-pistol/',
      '/en/military-law-enforcement/sniper-and-marksman-rifles/example/',
    ].map((path) => `<loc>https://example.invalid${path}</loc>`).join('');
    expect(productPages(sitemap)).toEqual(['https://example.invalid/en/hunting-rifles/example/', 'https://example.invalid/en/pistols/example-pistol/']);
  });

  it('ties each named tab to its figures by the tab number, and ignores the empty tab', () => {
    const found = tabs(PAGE);
    expect(found.map((tab) => tab.name)).toEqual(['STEYR EXAMPLE Mountain', 'STEYR EXAMPLE Long', 'STEYR EXAMPLE Scout', 'STEYR EXAMPLE Pistol']);
    expect(found[0]!.options.get('Barrel Length')).toBe('508 mm / 20"');
    expect(found[0]!.options.get('Caliber')).toBe('.308 Win., 6,5x55 SE, 22 Long Rifle');
  });

  it('splits a caliber line at a comma and a space, never at a decimal comma, and refuses a starred one', () => {
    expect(cartridgesOf('.308 Win., 6,5x55 SE, 9,3x62')).toEqual(['.308 Win.', '6,5x55 SE', '9,3x62']);
    expect(cartridgesOf('*223 Rem., .308 Win.')).toEqual([]);
  });

  it('reads what a weight includes from its own words', () => {
    expect(massBasisOf('With empty magazine: 787 g')).toBe('empty-magazine');
    expect(massBasisOf('3,0 kg without magazines')).toBe('without-magazine');
    expect(massBasisOf('approx. 3,35 kg')).toBe('unstated');
  });

  it('builds one gun per loadable cartridge of a tab, all with the tab figures, and leaves the rimfire', () => {
    const { guns, skipped } = firearmsFrom(tabs(PAGE)[0]!, URL, '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Steyr EXAMPLE Mountain .308 Win.', 'Steyr EXAMPLE Mountain 6,5x55 SE']);
    expect(skipped).toEqual(['STEYR EXAMPLE Mountain: 22 Long Rifle is not a cartridge to load for']);
    const first = guns[0]!;
    expect(first.maker).toBe('Steyr Arms');
    expect(first.barrel.length).toBeCloseTo(0.508, 12);
    expect(first.barrel.gunMass).toBeCloseTo(3.35, 12);
    expect(first.barrel.twistLength).toBeUndefined(); // the tab names several cartridges: no twist is paired with one
  });

  it('keeps a twist only when the tab names one cartridge, under the maker words for it', () => {
    const { guns } = firearmsFrom(tabs(PAGE)[2]!, URL, '2026-10-16');
    expect(guns).toHaveLength(1);
    expect(guns[0]!.barrel.twistLength).toBeCloseTo(7.9 * 0.0254, 12);
    expect(guns[0]!.source).toEqual({
      kind: 'published',
      publisher: 'Steyr Arms GmbH',
      url: URL,
      retrieved: '2026-10-16',
      massBasis: 'without-magazine',
      published: { barrelLength: '485mm / 19"', weight: '3,0 kg / 6.6 lbs without magazines', twist: '1 turn right in 7,9"' },
    });
  });

  it('skips a tab with two barrel lengths instead of choosing one', () => {
    const result = firearmsFrom(tabs(PAGE)[1]!, URL, '2026-10-16');
    expect(result.guns).toEqual([]);
    expect(result.skipped[0]).toContain('no single barrel length');
  });

  it("takes a pistol's weight with the empty magazine and not the magazine's own", () => {
    const { guns } = firearmsFrom(tabs(PAGE)[3]!, URL, '2026-10-16');
    expect(guns[0]!.barrel.gunMass).toBeCloseTo(0.787, 12);
    expect(guns[0]!.source?.massBasis).toBe('empty-magazine');
    expect(guns[0]!.source?.published?.['weight']).toBe('With empty magazine: 787 g / 27.76 oz');
  });
});
