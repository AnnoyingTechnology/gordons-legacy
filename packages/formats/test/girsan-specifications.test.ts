import { describe, expect, it } from 'vitest';
import { barrelLength, headings, readPage, weight } from '../../../tools/data/firearms/girsan.ts';

/**
 * Reading a maker's published specifications (tools/data/firearms/girsan.ts, issue #30). The pages below
 * are in the shape Girsan's product pages are — Elementor headings in pairs, a label and then the value
 * under it — with invented figures.
 *
 * What this maker's shape costs: the barrel is in millimetres and some pages print the figure with no
 * unit at all, which must not be read as inches; the weight is written `740 gr.`, the Turkish
 * abbreviation of gram and not the grain; and the caliber is spelled a different way on every other page
 * (`9mm x19`, `9X19 mm`, `.45ACP`), so the record carries a conventional name and the page's own word
 * beside it.
 */
function page(title: string, rows: Array<[string, string]>): string {
  const headingMarkup = rows
    .flat()
    .map((text) => `<h2 class="elementor-heading-title elementor-size-default">${text}</h2>`)
    .join('');
  return `<html><body><h1 class="product_title entry-title">${title}</h1>${headingMarkup}</body></html>`;
}

const URL = 'https://example.invalid/urun/example-28-black/';

const PISTOL = page('EXAMPLE 28 BLACK', [
  ['Caliber', '9mm x19'],
  ['Weight (Empty, without magazine)', '740 gr.'],
  ['Barrel Length', '120.5 mm'],
  ['Rifling', '6 Units (250 mm) Facing Right'],
]);

function gunOf(markup: string) {
  const reading = readPage(markup, URL, '2026-10-19')[0];
  return reading !== undefined && 'firearm' in reading ? reading.firearm : undefined;
}

function reasonOf(markup: string): string | undefined {
  const reading = readPage(markup, URL, '2026-10-19')[0];
  return reading !== undefined && 'skipped' in reading ? reading.skipped : undefined;
}

describe('reading a published specification', () => {
  it('reads the page headings in the order they are printed, label then value', () => {
    expect(headings(PISTOL)).toEqual([
      'Caliber',
      '9mm x19',
      'Weight (Empty, without magazine)',
      '740 gr.',
      'Barrel Length',
      '120.5 mm',
      'Rifling',
      '6 Units (250 mm) Facing Right',
    ]);
  });

  it('reads a barrel length in millimetres, and none from a figure with no unit', () => {
    expect(barrelLength('120.5 mm')).toBe(0.1205);
    expect(barrelLength('118.50')).toBeUndefined(); // the checker would read a bare figure as inches
    expect(barrelLength('4.72 in')).toBeUndefined(); // this maker prints millimetres; another unit is not theirs
  });

  it('reads `gr.` as the gram it abbreviates, and refuses a figure with a tolerance', () => {
    expect(weight('740 gr.')).toBe(0.74);
    expect(weight('1190 gr')).toBe(1.19);
    expect(weight('845+/-5 gr.')).toBeUndefined();
    expect(weight('40 gr.')).toBeUndefined(); // 40 g is no gun: the grain reading would have given this
  });

  it('writes the gun with a conventional cartridge name and the maker own word beside it', () => {
    const gun = gunOf(PISTOL);
    expect(gun?.name).toBe('Girsan Example 28 Black');
    expect(gun?.model).toBe('Example 28 Black');
    expect(gun?.cartridge).toBe('9x19 mm'); // so that a 9x19 load finds it
    expect(gun?.barrel.length).toBe(0.1205);
    expect(gun?.barrel.gunMass).toBe(0.74);
    expect(gun?.barrel.twistLength).toBeUndefined(); // `6 Units (250 mm)` does not say a turn is 250 mm long
    expect(gun?.source?.published).toMatchObject({ caliber: '9mm x19', barrelLength: '120.5 mm', weight: '740 gr.' });
  });

  it('says a mass is without the magazine only where the label says so', () => {
    expect(gunOf(PISTOL)?.source?.massBasis).toBe('without-magazine');
    const unsaid = page('EXAMPLE 28 SA', [['Caliber', '.45ACP'], ['Weight', '980 gr.'], ['Barrel Length', '110.0 mm']]);
    expect(gunOf(unsaid)?.source?.massBasis).toBe('unstated');
    expect(gunOf(unsaid)?.cartridge).toBe('.45 Auto');
  });

  it('keeps no weight string where the figure could not be read', () => {
    const tolerance = page('EXAMPLE 28 T', [['Caliber', '9X19 mm'], ['Weight (Empty, without magazine)', '845+/-5 gr.'], ['Barrel Length', '120.5 mm']]);
    const gun = gunOf(tolerance);
    expect(gun?.barrel.gunMass).toBeUndefined();
    expect(gun?.source?.published?.weight).toBeUndefined(); // a string with no figure behind it says nothing
  });

  it('leaves out a shotgun, a barrel with no unit and a page with no caliber, saying which and why', () => {
    expect(reasonOf(page('EXAMPLE 312', [['Caliber', '12 GA'], ['Barrel Length', '710.0 mm']]))).toBe('Example 312: no loadable cartridge (12 GA)');
    expect(reasonOf(page('EXAMPLE 28 U', [['Caliber', '9X19 MM'], ['Barrel Length', '118.50']]))).toBe(
      'Example 28 U: no barrel length in millimetres (118.50)',
    );
    expect(reasonOf(page('EXAMPLE 28 N', [['Barrel Length', '120.5 mm']]))).toBe('Example 28 N: no caliber');
    expect(reasonOf('<html><body>an accessory</body></html>')).toBe('no product heading');
  });
});
