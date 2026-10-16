import { describe, expect, it } from 'vitest';
import { cartridgeName, chamberingTables, firearmsFrom, length, mass, modelFromHeadline, notLoadable, productAddresses, settleNames, startingWeight, twistLength } from '../../../tools/data/firearms/christensen-arms.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/christensen-arms.ts, issue #30).
 * The pages below are written here in the shape the maker's pages have — a headline, a Starting Weight and
 * a table of chamberings — and their text is not reproduced; the figures are made up.
 */

function table(rows: string[][]): string {
  const cells = (tag: string, row: string[]) => `<tr>\n${row.map((text) => `<${tag}>${text}</${tag}>`).join('\n')}\n</tr>`;
  return `<table>\n<tbody>\n${cells('th', ['CALIBER', 'LENGTH', 'TWIST'])}\n${rows.map((row) => cells('td', row)).join('\n')}\n</tbody>\n</table>`;
}

function page(model: string, weight: string, rows: string[][]): string {
  return `<html><body><h1>${model}</h1><div class="et_pb_text_inner"><h3>Starting Weight</h3>${weight}</div>
<div class="et_pb_text_inner"><h3>Accuracy Guarantee</h3>SUB-MOA</div>
<div class="et_pb_tab_content">${table(rows)}</div></body></html>`;
}

const SEVERAL = page('Example Ridge', '5.4 LBS', [
  ['6.5 CRDMR', '24 in.', '1:8'],
  ['.308 WIN', '24 in.', '1:10'],
  ['.338 EXAMPLE MAG*', '27 in.', '1:9.3'],
  ['.22 LR', '20 in.', '1:16'],
]);
const SOLE = page('Example Mesa', '7.5 LBS', [['.308 WIN', '22 in.', '1:10']]);

describe('reading a published specification', () => {
  it('finds the chambering tables by their header, and no other', () => {
    const tables = chamberingTables(`${SEVERAL}<table><tr><td>Other</td></tr></table>`);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.header).toEqual(['CALIBER', 'LENGTH', 'TWIST']);
    expect(tables[0]!.rows[1]).toEqual(['.308 WIN', '24 in.', '1:10']);
  });

  it('finds the model in the headline, without the maker name', () => {
    expect(modelFromHeadline(SEVERAL)).toBe('Example Ridge');
    expect(modelFromHeadline('<h1>Christensen Arms Example</h1>')).toBe('Example');
  });

  it('reads the starting weight as printed', () => {
    expect(startingWeight(SEVERAL)).toBe('5.4 LBS');
    expect(startingWeight('<h1>Gift card</h1>')).toBeUndefined();
  });

  it('reads a barrel length in inches, and nothing without the unit', () => {
    expect(length('24 in.')).toBeCloseTo(0.6096, 12);
    expect(length('26"')).toBeCloseTo(0.6604, 12);
    expect(length('24')).toBeUndefined();
  });

  it('reads the twist as inches per turn, whole or decimal', () => {
    expect(twistLength('1:8')).toBeCloseTo(0.2032, 12);
    expect(twistLength('1:9.3')).toBeCloseTo(0.23622, 12);
    expect(twistLength('N/A')).toBeUndefined();
    expect(twistLength('1:0')).toBeUndefined();
  });

  it('reads a weight in pounds, and refuses a placeholder', () => {
    expect(mass('5.4 LBS')).toBeCloseTo(2.4494, 3);
    expect(mass('0 LBS')).toBeUndefined();
    expect(mass(undefined)).toBeUndefined();
  });

  it('drops a footnote mark from a cartridge and leaves out rimfires', () => {
    expect(cartridgeName('.338 EXAMPLE MAG*')).toBe('.338 EXAMPLE MAG');
    expect(notLoadable('.308 WIN')).toBeUndefined();
    expect(notLoadable('6.5 CRDMR')).toBeUndefined();
    expect(notLoadable('.22LR')).toBe('rimfire');
    expect(notLoadable('.17 HMR')).toBe('rimfire');
    expect(notLoadable('.22 WMR')).toBe('rimfire');
    expect(notLoadable('.22 CRDMR')).toBeUndefined();
    expect(notLoadable('.308 WIN / .300 BLK')).toBe('several cartridges');
  });

  it('builds one gun per loadable row, and no mass when the weight is the lightest of several', () => {
    const { firearms, skipped } = firearmsFrom(SEVERAL, 'https://example.invalid/product/example-ridge/', '2026-10-16');
    expect(firearms.map((gun) => gun.name)).toEqual(['Christensen Arms Example Ridge 6.5 CRDMR', 'Christensen Arms Example Ridge .308 WIN', 'Christensen Arms Example Ridge .338 EXAMPLE MAG']);
    expect(skipped).toEqual(['https://example.invalid/product/example-ridge/: rimfire (.22 LR)']);
    const gun = firearms[2]!;
    expect(gun.maker).toBe('Christensen Arms');
    expect(gun.barrel.length).toBeCloseTo(0.6858, 12);
    expect(gun.barrel.twistLength).toBeCloseTo(0.23622, 12);
    expect(gun.barrel.gunMass).toBeUndefined();
    expect(gun.source).toEqual({
      kind: 'published',
      publisher: 'Christensen Arms',
      url: 'https://example.invalid/product/example-ridge/',
      retrieved: '2026-10-16',
      published: { caliber: '.338 EXAMPLE MAG*', barrelLength: '27 in.', twist: '1:9.3' },
    });
  });

  it('takes the starting weight as the mass of a rifle with a single chambering, and says it is unstated', () => {
    const [gun] = firearmsFrom(SOLE, 'https://example.invalid/product/example-mesa/', '2026-10-16').firearms;
    expect(gun!.barrel.gunMass).toBeCloseTo(3.4019, 3);
    expect(gun!.source).toMatchObject({ massBasis: 'unstated', published: { weight: 'Starting Weight 7.5 LBS' } });
  });

  it('names a cartridge listed twice by its barrel length', () => {
    const twice = page('Example', '6 LBS', [['7MM BACKCOUNTRY', '16 in.', '1:8'], ['7MM BACKCOUNTRY', '20 in.', '1:8']]);
    expect(firearmsFrom(twice, 'u', '2026-10-16').firearms.map((gun) => gun.name)).toEqual(['Christensen Arms Example 7MM BACKCOUNTRY 16 in.', 'Christensen Arms Example 7MM BACKCOUNTRY 20 in.']);
  });

  it('keeps one of several listings with the same figures, and none of listings that differ', () => {
    const listing = (twist: string, url: string) => firearmsFrom(page('Example', '6 LBS', [['.308 WIN', '22 in.', twist]]), url, '2026-10-16').firearms[0]!;
    expect(settleNames([listing('1:10', 'a'), listing('1:10', 'b')]).kept.map((gun) => gun.source?.url)).toEqual(['a']);
    const different = settleNames([listing('1:10', 'a'), listing('1:12', 'b')]);
    expect(different.kept).toEqual([]);
    expect(different.skipped[0]).toContain('listed 2 times with different figures, none kept');
  });

  it('skips a page with no chambering table, such as a gift card', () => {
    const { firearms, skipped } = firearmsFrom('<h1>Gift Card</h1>', 'https://example.invalid/product/gift-card/', '2026-10-16');
    expect(firearms).toEqual([]);
    expect(skipped).toEqual(['https://example.invalid/product/gift-card/: no chambering table']);
  });

  it('takes the product pages of the sitemap and no shop page or image', () => {
    const sitemap = ['shop/', 'product/example-ridge/', 'wp-content/uploads/example.jpg'].map((path) => `<url><loc>https://example.invalid/${path}</loc></url>`).join('');
    expect(productAddresses(sitemap)).toEqual(['https://example.invalid/product/example-ridge/']);
  });
});
