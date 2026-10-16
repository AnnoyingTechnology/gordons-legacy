import { describe, expect, it } from 'vitest';
import { firearmsFrom, length, mass, modelFromHeadline, notLoadable, rifleAddresses, specificationBlocks, twistLength } from '../../../tools/data/firearms/winchester.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/winchester.ts, issue #30). The
 * page below is written here in the shape the maker's pages have — one tab pane per chambering, each a
 * table of titled cells — and its text is not reproduced; the figures are made up.
 */

function cell(key: string, value: string): string {
  return `<td class="spec-row"><b class="spec-key">${key}</b> <span class="spec-val">${value}</span></td>`;
}

function pane(index: number, figures: { caliber: string; barrel: string; weight: string; twist: string }): string {
  return `<div class="tab-pane fade${index === 0 ? ' in active' : ''}" id="riflesoption${index}">
<table class="specsTable"><tr>${cell('Item Number', '000000001')}${cell('UPC', '000000000001')}</tr>
<tr>${cell('Caliber', figures.caliber)}${cell('Barrel Length', figures.barrel)}</tr>
<tr>${cell('Weight', figures.weight)}${cell('Twist Rate', figures.twist)}</tr>
<tr>${cell('Overall Length', '41 1/2&#34;')}${cell('MSRP', '$999.99')}</tr></table></div>`;
}

const PAGE = `<html><head><title>Model 99 Example SS | Bolt-Action Rifle | Winchester</title></head><body>
<h1 class="responsive-title" data-title-font-mobile="20">Model 99 Example SS</h1>
<div class="dropdown-menu"><span class="spec-caliber">308 Win</span><span class="spec-barrel-length">22&#34;</span></div>
<div class="tab-content spec-data">
${pane(0, { caliber: '308 Win', barrel: '22&#34;', weight: '6 lbs 12 oz', twist: '12&#34;' })}
${pane(1, { caliber: '6.5 CREEDMOOR', barrel: '24 1/2&#34;', weight: '7 lbs 0 oz', twist: '9 1/2&#34;' })}
${pane(2, { caliber: '22 LR', barrel: '20&#34;', weight: '5 lbs 0 oz', twist: '16&#34;' })}
${pane(3, { caliber: '357-38', barrel: '20&#34;', weight: '7 lbs 4 oz', twist: '18 3/4&#34;' })}
${pane(4, { caliber: '300 WIN MAG', barrel: '26&#34;', weight: '0 lbs 0 oz', twist: 'N/A' })}
</div></body></html>`;

describe('reading a published specification', () => {
  it('finds one block of titled cells per chambering, and takes the first of each title', () => {
    const blocks = specificationBlocks(PAGE);
    expect(blocks).toHaveLength(5);
    expect(blocks[1]).toMatchObject({ caliber: '6.5 CREEDMOOR', 'barrel length': '24 1/2"', weight: '7 lbs 0 oz', 'twist rate': '9 1/2"' });
  });

  it('finds the model in the headline, without the maker name', () => {
    expect(modelFromHeadline(PAGE)).toBe('Model 99 Example SS');
    expect(modelFromHeadline('<h1>Winchester Example</h1>')).toBe('Example');
  });

  it('reads a barrel length in inches, with or without a fraction, and nothing without the mark', () => {
    expect(length('22"')).toBeCloseTo(0.5588, 12);
    expect(length('24 1/2"')).toBeCloseTo(0.6223, 12);
    expect(length('22')).toBeUndefined();
  });

  it('reads the twist as the inches per turn, with a fraction, with or without the 1:', () => {
    expect(twistLength('10"')).toBeCloseTo(0.254, 12);
    expect(twistLength('18 3/4"')).toBeCloseTo(0.47625, 12);
    expect(twistLength('1:8"')).toBeCloseTo(0.2032, 12);
    expect(twistLength('N/A')).toBeUndefined();
  });

  it('reads a weight in pounds and ounces, and refuses a placeholder', () => {
    expect(mass('6 lbs 12 oz')).toBeCloseTo(3.0618, 3);
    expect(mass('7 lbs 0 oz')).toBeCloseTo(3.175, 3);
    expect(mass('7.5 lbs')).toBeCloseTo(3.4019, 3);
    expect(mass('0 lbs 0 oz')).toBeUndefined();
    expect(mass('heavy')).toBeUndefined();
  });

  it('leaves out rimfires and chamberings that name several cartridges', () => {
    expect(notLoadable('308 Win')).toBeUndefined();
    expect(notLoadable('45-70 GOVT')).toBeUndefined();
    expect(notLoadable('30-30 WIN')).toBeUndefined();
    expect(notLoadable('22 LR')).toBe('rimfire');
    expect(notLoadable('17 HMR')).toBe('rimfire');
    expect(notLoadable('22 WMR')).toBe('rimfire');
    expect(notLoadable('357-38')).toBe('several cartridges');
    expect(notLoadable('')).toBe('no cartridge');
  });

  it('builds one gun per loadable chambering, and says what it skipped', () => {
    const { firearms, skipped } = firearmsFrom(PAGE, 'https://example.invalid/products/rifles/model-99/example.html', '2026-10-16');
    expect(firearms.map((gun) => gun.name)).toEqual(['Winchester Model 99 Example SS 308 Win', 'Winchester Model 99 Example SS 6.5 CREEDMOOR', 'Winchester Model 99 Example SS 300 WIN MAG']);
    expect(skipped).toEqual([
      'https://example.invalid/products/rifles/model-99/example.html: rimfire (22 LR)',
      'https://example.invalid/products/rifles/model-99/example.html: several cartridges (357-38)',
    ]);
    const first = firearms[0]!;
    expect(first.maker).toBe('Winchester');
    expect(first.model).toBe('Model 99 Example SS');
    expect(first.cartridge).toBe('308 Win');
    expect(first.barrel.length).toBeCloseTo(0.5588, 12);
    expect(first.barrel.twistLength).toBeCloseTo(0.3048, 12);
    expect(first.barrel.gunMass).toBeCloseTo(3.0618, 3);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Winchester Repeating Arms',
      url: 'https://example.invalid/products/rifles/model-99/example.html',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { caliber: '308 Win', barrelLength: '22"', weight: '6 lbs 12 oz', twist: '12"' },
    });
  });

  it('keeps a gun without a twist or a plausible weight, and claims neither', () => {
    const last = firearmsFrom(PAGE, 'https://example.invalid/x.html', '2026-10-16').firearms[2]!;
    expect(last.barrel.twistLength).toBeUndefined();
    expect(last.barrel.gunMass).toBeUndefined();
    expect(last.source?.massBasis).toBeUndefined();
    expect(last.source?.published).toEqual({ caliber: '300 WIN MAG', barrelLength: '26"', weight: '0 lbs 0 oz', twist: 'N/A' });
  });

  it('names a cartridge listed twice by its barrel length', () => {
    const page = `<h1>Model 1</h1>${pane(0, { caliber: '45 Colt', barrel: '20&#34;', weight: '7 lbs 0 oz', twist: '26&#34;' })}${pane(1, { caliber: '45 Colt', barrel: '24&#34;', weight: '7 lbs 8 oz', twist: '26&#34;' })}`;
    expect(firearmsFrom(page, 'u', '2026-10-16').firearms.map((gun) => gun.name)).toEqual(['Winchester Model 1 45 Colt 20"', 'Winchester Model 1 45 Colt 24"']);
  });

  it('takes the rifle pages of the sitemap, current and discontinued, and no overview, shotgun or stray page', () => {
    const sitemap = ['rifles/xpr/overview', 'rifles/xpr/xpr-example', 'discontinued/rifles/old-example', 'shotguns/sxp/sxp-example', 'rifles/xpr']
      .map((path) => `<url><loc>https://example.invalid/products/${path}.html</loc></url>`)
      .join('');
    expect(rifleAddresses(sitemap)).toEqual(['https://example.invalid/products/rifles/xpr/xpr-example.html', 'https://example.invalid/products/discontinued/rifles/old-example.html']);
  });
});
