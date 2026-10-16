import { describe, expect, it } from 'vitest';
import { agree, blocks, firearmsFrom, inches, plain, productPages, titleOf } from '../../../tools/data/firearms/pedersoli.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/pedersoli.ts, issue #30). The page
 * below is written here in the shape the maker's pages have, in Italian: a title, then one "Specifiche
 * tecniche" list per chambering of label and value spans. Its figures are made up.
 */

function pair(label: string, value: string): string {
  return `<div class="d-flex"><span class="font-weight-lighter">${label}</span> \n <span class="font-weight-bold">${value}</span></div>`;
}

interface Chambering {
  cartridge: string;
  barrelMillimetres?: string;
  barrelInches?: string;
  kilograms?: string;
  pounds?: string;
  twistMillimetres?: string;
  twistInches?: string;
}

function list(chambering: Chambering): string {
  return `<div class="variants__list">${[
    pair('Calibro', chambering.cartridge),
    pair('Righe', '6'),
    pair('Passo in mm', chambering.twistMillimetres ?? '460'),
    pair('Passo in pollici', chambering.twistInches ?? '1:18'),
    pair('Lunghezza canna in mm', chambering.barrelMillimetres ?? '813,00'),
    pair('Lunghezza canna in pollici', chambering.barrelInches ?? '32'),
    pair('Peso in Kg', chambering.kilograms ?? '4,800'),
    pair('Peso in libbre', chambering.pounds ?? '10.58'),
  ].join('')}</div>`;
}

function page(title: string, chamberings: Chambering[]): string {
  return `<html><body><h1 class="h3">${title}</h1>${chamberings.map(list).join('')}</body></html>`;
}

describe('reading a published specification', () => {
  it('lists the product pages from the sitemap', () => {
    const sitemap = '<loc>https://example.invalid/prodotto/sharps-32</loc><loc>https://example.invalid/company</loc>';
    expect(productPages(sitemap)).toEqual(['https://example.invalid/prodotto/sharps-32']);
  });

  it('reads one block of labelled values per chambering', () => {
    const found = blocks(page('Example', [{ cartridge: '.45-70 Gov.' }, { cartridge: '.45-90 Sharps' }]));
    expect(found.map((block) => block.cartridge)).toEqual(['.45-70 Gov.', '.45-90 Sharps']);
    expect(found[0]).toMatchObject({ barrelMillimetres: '813,00', barrelInches: '32', weightKilograms: '4,800', twistMillimetres: '460' });
    expect(titleOf(page('Example &quot;Q&quot; 34&quot;', []))).toBe('Example "Q" 34"');
  });


  it('reads comma decimals, mixed fractions of an inch, and nothing else', () => {
    expect(plain('813,00')).toBeCloseTo(813, 12);
    expect(plain('10.58')).toBeCloseTo(10.58, 12);
    expect(plain('1:18')).toBeUndefined();
    expect(inches('18  1/8')).toBeCloseTo(18.125, 12);
    expect(inches('4,2')).toBeCloseTo(4.2, 12);
    expect(agree(0.813, 32 * 0.0254, 0.03)).toBe(true);
    expect(agree(5.67, 22 * 0.0254, 0.03)).toBe(false);
  });

  it('builds a gun per chambering, taking the metric figures and keeping both renderings as printed', () => {
    const { guns, rejected } = firearmsFrom(page('Example 32', [{ cartridge: '.45-70 Gov.' }, { cartridge: '.45-90 Sharps' }]), 'https://example.invalid/prodotto/example-32', '2026-10-16');
    expect(rejected).toEqual([]);
    expect(guns.map((gun) => gun.name)).toEqual(['Pedersoli Example 32 .45-70 Gov.', 'Pedersoli Example 32 .45-90 Sharps']);
    const first = guns[0]!;
    expect(first.barrel.length).toBeCloseTo(0.813, 12);
    expect(first.barrel.twistLength).toBeCloseTo(0.46, 12);
    expect(first.barrel.gunMass).toBeCloseTo(4.8, 12);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Davide Pedersoli & C.',
      url: 'https://example.invalid/prodotto/example-32',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { caliber: '.45-70 Gov.', barrelLength: '813,00 mm | 32 in', weight: '4,800 kg | 10.58 lbs', twist: '460 mm | 1:18' },
    });
  });

  it('names a single-chambering page after its title alone', () => {
    const { guns } = firearmsFrom(page('Example LX .45-70', [{ cartridge: '.45-70 Gov.' }]), 'u', '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Pedersoli Example LX .45-70']);
  });

  it('leaves out a chambering whose two renderings disagree, and says why', () => {
    const { guns, rejected } = firearmsFrom(page('Example 22', [{ cartridge: '.45-70 Gov.', barrelMillimetres: '5670,00', barrelInches: '22' }, { cartridge: '8x57 mm JRS', barrelMillimetres: '560,00', barrelInches: '22' }]), 'u', '2026-10-16');
    expect(guns.map((gun) => gun.cartridge)).toEqual(['8x57 mm JRS']);
    expect(rejected).toEqual([{ cartridge: '.45-70 Gov.', reason: 'barrel 5670,00 mm against 22 inches' }]);
    const weight = firearmsFrom(page('Example', [{ cartridge: '.45-70 Gov.', kilograms: '5,100', pounds: '12.11' }]), 'u', '2026-10-16');
    expect(weight.rejected[0]!.reason).toBe('weight 5,100 kg against 12.11 lbs');
  });

  it('writes nothing for a muzzle-loader', () => {
    const { guns, rejected } = firearmsFrom(page('Example Hawken', [{ cartridge: '.54' }]), 'u', '2026-10-16');
    expect(guns).toEqual([]);
    expect(rejected).toEqual([]);
  });
});
