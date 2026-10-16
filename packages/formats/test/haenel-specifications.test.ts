import { describe, expect, it } from 'vitest';
import { barrelFor, barrelsOf, cartridgeName, cartridgesOf, firearmsFrom, productPages, variants, weightFor } from '../../../tools/data/firearms/haenel.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/haenel.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — one block per variant, a title with a
 * second line, audience badges and a table of German labels — and its text is not reproduced; the
 * figures are made up.
 */

function block(id: string, title: string, second: string, badges: string[], rows: Record<string, string>): string {
  const badge = badges.map((name) => `<span class="hnl-product-details-title-badge bg-color-${name}"> ${name[0]!.toUpperCase()} </span>`).join('');
  const table = Object.entries(rows)
    .map(([label, value]) => `<tr><td class="hnl-product-details-details-content-td-first-col" scope="row">${label}</td><td class="hnl-product-details-details-content-td-second-col">${value}</td></tr>`)
    .join('');
  return `<div id="${id}" class="hnl-product-details"><div class="hnl-product-details-title"><h2 class="hnl-headline-border-sm">${title} <span class="hnl-product-details-title-two">${second}</span></h2>
<div class="hnl-product-details-title-badges">${badge}</div></div><div class="hnl-details-toggle">Technische Details<table class="table"><tbody>${table}</tbody></table></div></div>`;
}

const BOLT = block('EXAMPLEONE', 'EXAMPLE ONE', 'COMPOSITE', ['jagd'], {
  'Kaliber (Drall)': '.308 Win. (12,0&#8221;) / 8x57 IS (9,4&#8221;) / .300 Win. Mag. (11,0&#8221;)',
  Gesamtlänge: '1045 mm (Standard) / 1135 mm (Magnum)',
  Lauflänge: '520 mm (Standard) / 610 mm (Magnum)',
  Gewicht: 'ca. 3,1 kg',
});
const SELF_LOADER = block('EXAMPLETWO', 'EXAMPLE TWO', '', ['sport', 'defence'], {
  Kaliber: '7,62 x 51 mm (Zivil: .308 Win.)',
  'Lauflänge, Drall': '14,5&#8220;: 368mm, 12&#8220; (nur für Behörden erhältlich) / 16,65&#8220;: 423mm, 12&#8220; / 20&#8220;: 510mm, 12&#8221;',
  Gewicht: '14,5&#8220;: ca. 3,5 kg / 16,65&#8220;: ca. 3,6 kg / 20&#8220;: ca. 4,6 kg',
});
const RANGE = block('EXAMPLETHREE', 'EXAMPLE THREE', '', ['sport'], {
  Kaliber: '7,62 x 51 mm (Zivil: .308 Win.)',
  'Lauflänge, Drall': '16,65&#8220;: 423mm, 12&#8220;',
  Gewicht: 'ca. 4,3kg &#8211; 4,6kg',
});
const AUTHORITIES = block('EXAMPLEFOUR', 'EXAMPLE FOUR', '', ['defence'], { Kaliber: '5,56 x 45 mm', 'Lauflänge, Drall': '10,5&#8220;: 266mm, 7&#8220;', Gewicht: '10,5&#8220;: ca. 3,35 kg' });
const TRAINING = block('EXAMPLEFIVE', 'EXAMPLE FIVE', 'UEB', ['sport'], { Kaliber: '.223 Farbmunition (FX-Simunition)', Lauflänge: '400 mm', Gewicht: 'ca. 3 kg' });
const PAGE = `<html><body>${BOLT}${SELF_LOADER}${RANGE}${AUTHORITIES}${TRAINING}</body></html>`;

const URL = 'https://example.invalid/produkte/example/';

describe('reading a published specification', () => {
  it('lists the product pages of a sitemap, once each', () => {
    const sitemap = `<loc>https://example.invalid/produkte/a/</loc><loc>https://example.invalid/produkte/a/</loc><loc>https://example.invalid/service/b/</loc><loc>https://example.invalid/produkte/</loc>`;
    expect(productPages(sitemap)).toEqual(['https://example.invalid/produkte/a/']);
  });

  it('splits a page into its variants with their audience and their table', () => {
    const found = variants(PAGE);
    expect(found.map((variant) => variant.title)).toEqual(['EXAMPLE ONE COMPOSITE', 'EXAMPLE TWO', 'EXAMPLE THREE', 'EXAMPLE FOUR', 'EXAMPLE FIVE UEB']);
    expect(found[0]!.audiences).toEqual(['jagd']);
    expect(found[1]!.audiences).toEqual(['sport', 'defence']);
    expect(found[0]!.details.get('Lauflänge')).toBe('520 mm (Standard) / 610 mm (Magnum)');
    expect(variants('<html><body>an accessory</body></html>')).toEqual([]);
  });

  it('names a cartridge the way a reloader does', () => {
    expect(cartridgeName('7,62 x 51 mm (Zivil: .308 Win.)')).toBe('.308 Win.');
    expect(cartridgeName('7,62 x 51 mm (.308 Win.)')).toBe('.308 Win.');
    expect(cartridgeName('6,5 Creedmoor')).toBe('6,5 Creedmoor');
  });

  it('pairs each cartridge with the twist printed beside it', () => {
    const [bolt] = variants(PAGE);
    expect(cartridgesOf(bolt!.details)).toEqual([
      { cartridge: '.308 Win.', twist: '12,0"' },
      { cartridge: '8x57 IS', twist: '9,4"' },
      { cartridge: '.300 Win. Mag.', twist: '11,0"' },
    ]);
  });

  it('gives the magnum cartridge the Magnum barrel and every other the Standard one', () => {
    const [bolt] = variants(PAGE);
    const barrels = barrelsOf(bolt!.details);
    expect(barrelFor('.308 Win.', barrels)?.length).toBe('520 mm (Standard)');
    expect(barrelFor('.300 Win. Mag.', barrels)?.length).toBe('610 mm (Magnum)');
    expect(barrelFor('.300 Win. Mag.', [{ label: 'Standard', length: '470 mm (Standard)' }])).toBeUndefined();
  });

  it('builds one gun per cartridge, each with its own barrel, twist and the variant weight', () => {
    const [bolt] = variants(PAGE);
    const { guns } = firearmsFrom(bolt!, URL, '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Haenel EXAMPLE ONE COMPOSITE .308 Win.', 'Haenel EXAMPLE ONE COMPOSITE 8x57 IS', 'Haenel EXAMPLE ONE COMPOSITE .300 Win. Mag.']);
    const magnum = guns[2]!;
    expect(magnum.barrel.length).toBeCloseTo(0.61, 12);
    expect(magnum.barrel.twistLength).toBeCloseTo(11 * 0.0254, 12);
    expect(magnum.barrel.gunMass).toBeCloseTo(3.1, 12);
    expect(magnum.source).toEqual({
      kind: 'published',
      publisher: 'C.G. Haenel GmbH',
      url: URL,
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { barrelLength: '610 mm (Magnum)', weight: 'ca. 3,1 kg', twist: '11,0"' },
    });
  });

  it('writes one gun per barrel length for a self-loader, with the weight of that length', () => {
    const [, loader] = variants(PAGE);
    expect(weightFor(loader!.details, { label: '16,65', length: '' })).toBe('16,65": ca. 3,6 kg');
    const { guns } = firearmsFrom(loader!, URL, '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Haenel EXAMPLE TWO .308 Win. 422.9 mm barrel', 'Haenel EXAMPLE TWO .308 Win. 510 mm barrel']);
    expect(guns[0]!.barrel.length).toBeCloseTo(16.65 * 0.0254, 12);
    expect(guns[0]!.barrel.gunMass).toBeCloseTo(3.6, 12);
    expect(guns[1]!.barrel.length).toBeCloseTo(0.51, 12); // 510mm is printed to a finer step than the 20 inches beside it
    expect(guns[1]!.barrel.gunMass).toBeCloseTo(4.6, 12);
  });

  it('leaves the mass out of a gun whose weight is a range, and does not average it', () => {
    const { guns } = firearmsFrom(variants(PAGE)[2]!, URL, '2026-10-16');
    expect(guns).toHaveLength(1);
    expect(guns[0]!.barrel.gunMass).toBeUndefined();
    expect(guns[0]!.source?.massBasis).toBeUndefined();
  });

  it('leaves out a variant only for authorities and a training rifle', () => {
    const found = variants(PAGE);
    expect(firearmsFrom(found[3]!, URL, '2026-10-16')).toEqual({ guns: [], skipped: ['EXAMPLE FOUR: only for authorities'] });
    expect(firearmsFrom(found[4]!, URL, '2026-10-16').guns).toEqual([]);
  });
});
