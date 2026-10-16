import { describe, expect, it } from 'vitest';
import { firearmsFrom, productPages } from '../../../tools/data/firearms/desert-tech.ts';
import { auditFirearm } from '../../../tools/data/firearms/check-corpus.ts';
import { firearmJson } from '../../../tools/data/firearms/maker-site.ts';
import { units } from '../src/index.ts';

// Invented figures in the public page's shape; no manufacturer's page is committed.
const variant = (sku: string, specs: Record<string, string>) => ({
  sku, weightLb: 16.2,
  specs: Object.entries(specs).map(([label, value]) => ({ label, value })),
});
const specifications = {
  Caliber: '.308 Win', 'Barrel Length': '23"', 'Barrel Twist': '1 in 12"',
  Weight: '8.4lb', 'Shipping weight': '16.2 lb',
};
const page = (variants: unknown[], overrides: Record<string, unknown> = {}) => `<script id="ng-state" type="application/json">${JSON.stringify({
  request: { b: { kind: 'product', product: {
    name: 'Example Rifle', categories: [{ slug: 'firearms' }], variants,
    specs: variant('selected', specifications).specs, ...overrides,
  } } },
})}</script>`;
const parse = (html: string) => firearmsFrom(html, 'https://deserttech.com/example-rifle', '2026-10-16');

describe('Desert Tech public configuration specifications', () => {
  it('keeps each configuration separate and reads gun weight rather than shipping weight', () => {
    const result = parse(page([
      variant('EXAMPLE-B', specifications),
      variant('EXAMPLE-F', { ...specifications, Caliber: '6.5 Creedmoor', 'Barrel Length': '25"', Weight: '9.3lb' }),
    ]));
    expect(result.skipped).toEqual([]);
    expect(result.firearms).toHaveLength(2);
    const [first, second] = result.firearms;
    expect(first!.barrel.length).toBeCloseTo(23 * units.INCH, 12);
    expect(first!.barrel.gunMass).toBeCloseTo(8.4 * units.POUND, 12);
    expect(first!.barrel.twistLength).toBeCloseTo(12 * units.INCH, 12);
    expect(second!.barrel.length).toBeCloseTo(25 * units.INCH, 12);
    expect(second!.barrel.gunMass).toBeCloseTo(9.3 * units.POUND, 12);
    expect(first!.source).toMatchObject({ massBasis: 'unstated', published: { partNumber: 'EXAMPLE-B', weight: '8.4lb', twist: '1 in 12"' } });
    expect(first!.name).not.toBe(second!.name);
    for (const firearm of result.firearms) {
      expect(firearmJson(firearm)).toHaveProperty('text');
      expect(auditFirearm(firearm)).toEqual([]);
    }
  });

  it('never fills missing variant figures from the selected product or shipping field', () => {
    const result = parse(page([variant('EXAMPLE', { Caliber: '.308 Win', 'Barrel Length': '23"', 'Barrel Twist': '1:12' })]));
    expect(result.firearms).toHaveLength(1);
    expect(result.firearms[0]!.barrel.gunMass).toBeUndefined();
    expect(result.firearms[0]!.barrel.twistLength).toBeUndefined();
    expect(result.firearms[0]!.source!.published!['twist']).toBe('1:12');
  });

  it('reports incomplete configurations and excludes rimfire, airsoft and parts', () => {
    const result = parse(page([
      variant('NO-UNIT', { ...specifications, 'Barrel Length': '23' }),
      variant('RIMFIRE', { ...specifications, Caliber: '.22 LR' }),
    ]));
    expect(result.firearms).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(parse(page([variant('PART', specifications)], { name: 'Example Conversion Kit' })).firearms).toEqual([]);
    expect(parse(page([variant('AIR', specifications)], { name: 'Airsoft Rifle' })).firearms).toEqual([]);
    expect(parse(page([variant('PART', specifications)], { categories: [{ slug: 'parts' }] })).firearms).toEqual([]);
  });

  it('reports a changed page shape and rejects malformed state', () => {
    expect(parse('<html></html>').skipped).toEqual(['no public product state']);
    expect(() => parse('<script id="ng-state">broken</script>')).toThrow();
  });

  it('selects complete gun product pages, not accessories or API paths', () => {
    const urls = ['srs-m2-rifle', 'srs-a2-covert-rifle', 'hti-rifle', 'mdrx-rifle', 'wlvrn-rifle', 'wlvrn-micron-rifle',
      'quattro-15-rifle', 'quattro-15-pistol', 'quattro-15-lite-rifle-example',
      'trek-22-rifle', 'srs-conversion-kit', 'quattro-15-lower-receiver', 'api/public/products/srs-m2-rifle'];
    const sitemap = urls.map((url) => `<loc>https://deserttech.com/${url}</loc>`).join('');
    expect(productPages(sitemap)).toEqual(urls.slice(0, 9).map((url) => `https://deserttech.com/${url}`));
  });
});
