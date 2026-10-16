import { describe, expect, it } from 'vitest';
import { barrelLength, chamberings, firearmsFrom, labelledValues, mass, productPages } from '../../../tools/data/firearms/sabatti.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/sabatti.ts, issue #30). The page
 * below is written here in the shape the maker's pages have, in Italian: a list of labelled paragraphs and
 * a "Calibri" list separated by line breaks. Its figures are made up.
 */

function row(label: string, value: string): string {
  return `<p class="mb-1 text-muted">\n ${label}:\n <span class="mb-0 font-weight-bold primary-color">\n ${value}\n </span>\n </p>`;
}

function page(rows: [string, string][], calibers: string): string {
  return `<html><head><title>Example (Example)</title></head><body>${rows.map(([label, value]) => row(label, value)).join('')}
<div><h4><strong>Calibri</strong></h4><p>${calibers}</p><h4><strong>Caratteristiche</strong></h4><ul><li>x</li></ul></div></body></html>`;
}

const PAGE = page(
  [['Modello', 'Example 7'], ['Lunghezza canna', '61 cm / 24&quot;'], ['Peso', '4,6 kg / 10.14 lbs']],
  '<strong>.223 Remington (passo 9&rdquo;)</strong><br><strong>6,5 Creedmoor<br>.308 Winchester (no MRR)<br>12/76</strong>',
);

describe('reading a published specification', () => {
  it('lists the product pages in Italian from the sitemap', () => {
    const sitemap = '<loc>https://www.sabatti.it/prodotto/rover-hunter</loc><loc>https://www.sabatti.it/prodotti/caccia</loc>';
    expect(productPages(sitemap)).toEqual(['https://www.sabatti.it/it/prodotto/rover-hunter']);
  });

  it('reads the labelled paragraphs', () => {
    const values = labelledValues(PAGE);
    expect(values.get('Modello')).toBe('Example 7');
    expect(values.get('Peso')).toBe('4,6 kg / 10.14 lbs');
  });

  it('keeps the barrel length printed to the finer step, and refuses a list', () => {
    expect(barrelLength('61 cm / 24"')).toBeCloseTo(0.61, 12);
    expect(barrelLength('45 cm / 17.7"')).toBeCloseTo(0.44958, 9);
    expect(barrelLength('60 cm')).toBeCloseTo(0.6, 12);
    expect(barrelLength('51-56-61 cm / 20"-22"-24"')).toBeUndefined();
    expect(barrelLength('12" / 14" / 18"')).toBeUndefined();
    expect(barrelLength('61 cm / 12"')).toBeUndefined();
  });

  it('keeps the mass printed to the finer step, and refuses a range or a pair that disagree', () => {
    expect(mass('4,6 kg / 10.14 lbs')).toBeCloseTo(4.5995, 3);
    expect(mass('3 kg')).toBeCloseTo(3, 12);
    expect(mass('2,8-3,3 kg / 6.2-7.3 lbs (min-max famiglia)')).toBeUndefined();
    expect(mass('4,6 kg / 20 lbs')).toBeUndefined();
    expect(mass('xx kg / xx lbs')).toBeUndefined();
  });

  it('reads the cartridge list, the twist an annotation gives, and sets aside a gauge and other annotations', () => {
    const { chamberings: found, left } = chamberings(PAGE);
    expect(found.map((chambering) => chambering.cartridge)).toEqual(['.223 Remington', '6,5 Creedmoor']);
    expect(found[0]!.twist).toBeCloseTo(0.2286, 12);
    expect(left).toEqual(['.308 Winchester (no MRR)', '12/76']);
  });


  it('builds a gun per cartridge sharing the page\'s barrel and weight, and keeps the maker\'s strings', () => {
    const guns = firearmsFrom(PAGE, 'https://example.invalid/it/prodotto/example-7', '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Sabatti Example 7 .223 Remington', 'Sabatti Example 7 6,5 Creedmoor']);
    expect(guns[0]!.barrel.twistLength).toBeCloseTo(0.2286, 12);
    expect(guns[1]!.barrel.twistLength).toBeUndefined();
    expect(guns[0]!.source).toEqual({
      kind: 'published',
      publisher: 'Sabatti',
      url: 'https://example.invalid/it/prodotto/example-7',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { caliber: '.223 Remington (passo 9")', barrelLength: '61 cm / 24"', weight: '4,6 kg / 10.14 lbs', twist: '1:9"' },
    });
  });

  it('writes no gun for a page with several barrel lengths', () => {
    const several = page([['Modello', 'Family'], ['Lunghezza canna', '51-56-61 cm / 20&quot;-22&quot;-24&quot;'], ['Peso', '3 kg']], '<strong>.308 Winchester</strong>');
    expect(firearmsFrom(several, 'u', '2026-10-16')).toEqual([]);
  });
});
