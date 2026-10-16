import { describe, expect, it } from 'vitest';
import { firearmFrom, massBasisOf, productTitle, rifleLinks, specification } from '../../../tools/data/firearms/oberland-arms.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/oberland-arms.ts, issue #30). The
 * page below is written here in the shape the maker's pages have — a shop page whose description holds a
 * bilingual specification of labelled lines — and its text is not reproduced; the figures are made up.
 */

function page(title: string, specification: Record<string, string>, shippingWeight = '4,5 kg'): string {
  const lines = Object.entries(specification).map(([label, value]) => `<p>${label}</p><p>${value}</p>`).join('');
  return `<html><head><meta name="description" content="Details / Ausstattung / Specification…"></head><body>
<h1 class="product--title" itemprop="name"> ${title} </h1><span class="shipping">Gewicht: ${shippingWeight}</span>
<div class="description"><p>Details / Ausstattung / Specifications:</p>${lines}<p>Lieferumfang / Scope of Delivery:</p><p>1x Transportkoffer</p></div></body></html>`;
}

const RIFLE = page('OA-15 Example, Lauf 20&quot;, M-LOK Handguard', {
  'Artikel-Gruppe/Serie:': 'OA-15 Example Serie',
  'Kaliber / caliber:': '.223Rem./5,56x45mm',
  'Lauflänge / barrel lenght:': '20&quot; / 51cm',
  'Gewicht mit leerem Magazin / weight:': 'ca. 3,7kg',
});

const URL = 'https://example.invalid/waffen/premium-series/1/example';

describe('reading a published specification', () => {
  it('lists the rifle pages of a sitemap and leaves out the pistols, the uppers and the parts', () => {
    const sitemap = [
      '/waffen/premium-series/1/oa-15-example',
      '/waffen/premium-series/',
      '/waffen/kurzwaffen/glock-custom-shop/2/pistol',
      '/waffen/kal.-9mm/3/wechselsystem-c9-example',
      '/parts/hinterschaefte/4/stock',
    ].map((path) => `<loc>https://www.oberlandarms.com${path}</loc>`).join('');
    expect(rifleLinks(sitemap)).toEqual(['https://www.oberlandarms.com/waffen/premium-series/1/oa-15-example']);
  });

  it('reads the title and the labelled lines of the specification, up to the scope of delivery', () => {
    expect(productTitle(RIFLE)).toBe('OA-15 Example, Lauf 20", M-LOK Handguard');
    const details = specification(RIFLE);
    expect(details.get('Kaliber / caliber:')).toBe('.223Rem./5,56x45mm');
    expect(details.has('Lieferumfang / Scope of Delivery:')).toBe(false);
  });

  it('builds the gun from the specification, with the cartridge in the name a reloader uses', () => {
    const gun = firearmFrom(RIFLE, URL, '2026-10-16');
    if ('skipped' in gun) throw new Error(gun.skipped);
    expect(gun.name).toBe('Oberland Arms OA-15 Example, Lauf 20", M-LOK Handguard');
    expect(gun.cartridge).toBe('.223 Rem.');
    expect(gun.barrel.length).toBeCloseTo(0.51, 12); // 51cm is printed to a finer step than the 20 inches
    expect(gun.barrel.gunMass).toBeCloseTo(3.7, 12); // from the description, never the shop's shipping weight of 4,5 kg
    expect(gun.barrel.twistLength).toBeUndefined();
    expect(gun.source).toEqual({
      kind: 'published',
      publisher: 'Oberland Arms GmbH',
      url: URL,
      retrieved: '2026-10-16',
      massBasis: 'empty-magazine',
      published: { barrelLength: '20" / 51cm', weight: 'ca. 3,7kg', caliber: '.223Rem./5,56x45mm' },
    });
  });

  it('reads what a weight includes from its label and its words', () => {
    expect(massBasisOf('Gewicht mit leerem Magazin / weight:', '3,0kg')).toBe('empty-magazine');
    expect(massBasisOf('Gewicht mit leerem Magazin / weight:', '1.780 g (ohne Magazin)')).toBe('without-magazine');
    expect(massBasisOf('Gewicht:', '3,0kg')).toBe('unstated');
  });

  it('skips an upper receiver, a training rifle, a rimfire and a barrel whose units contradict each other', () => {
    const base = { 'Kaliber / caliber:': '.223Rem./5,56x45mm', 'Lauflänge / barrel lenght:': '10,5&quot; / 26,7cm', 'Gewicht mit leerem Magazin / weight:': '2,9kg' };
    expect(firearmFrom(page('Wechselsystem Example', base), URL, '2026-10-16')).toMatchObject({ skipped: expect.stringContaining('upper receiver') });
    expect(firearmFrom(page('OA-15 FX Trainingswaffe', base), URL, '2026-10-16')).toMatchObject({ skipped: expect.stringContaining('training rifle') });
    expect(firearmFrom(page('OA-22 Example', { ...base, 'Kaliber / caliber:': '.22lr' }), URL, '2026-10-16')).toMatchObject({ skipped: expect.stringContaining('not a cartridge') });
    expect(firearmFrom(page('OA-15 Example', { ...base, 'Lauflänge / barrel lenght:': '16&quot; / 40,64mm' }), URL, '2026-10-16')).toMatchObject({ skipped: expect.stringContaining('no single barrel length') });
  });

  it('keeps a cartridge form it does not know as the maker wrote it, and leaves a missing weight out', () => {
    const gun = firearmFrom(page('OA-15 Example', { 'Kaliber / caliber:': '.350 Legend', 'Lauflänge / barrel lenght:': '16&quot; / 406mm', 'Gewicht mit leerem Magazin / weight:': 'auf Anfrage' }), URL, '2026-10-16');
    if ('skipped' in gun) throw new Error(gun.skipped);
    expect(gun.cartridge).toBe('.350 Legend');
    expect(gun.barrel.gunMass).toBeUndefined();
    expect(gun.source?.massBasis).toBeUndefined();
  });
});
