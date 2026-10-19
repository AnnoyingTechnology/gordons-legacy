import { describe, expect, it } from 'vitest';
import { heading, readPage } from '../../../tools/data/firearms/fn-america.ts';

/**
 * Reading a maker's published specifications (tools/data/firearms/fn-america.ts, issue #30). The pages
 * below are in the shape FN's product pages are — a heading and a `Specs` list of `Label: value` lines —
 * with invented figures.
 *
 * Two of the cases below are faults this extractor had. The M16A4 page prints `Barrel Length:` with
 * nothing after it and `Overall Length: 39.63"` on the line below, which became a 1006.6 mm barrel
 * (2026-10-16); and a rifle sold in two cartridges prints both their twists in one cell, which must not
 * become one twist. The sitemap also lists accessories, suppressors and launchers beside the guns, and
 * an upper or a conversion kit is not a gun anyone chambers a cartridge in.
 */
function page(title: string, specifications: Array<[string, string]>): string {
  const rows = specifications.map(([label, value]) => `<li><strong>${label}:</strong> ${value}</li>`).join('');
  return `<html><body><h1>${title}</h1><h2>Specs</h2><ul>${rows}</ul></body></html>`;
}

const URL = 'https://example.invalid/products/pistols/example-pistol/';

const PISTOL = page('Example Pistol&trade;-40 Compact', [
  ['Caliber', '40 S&amp;W'],
  ['Weight', '25.8 oz.'],
  ['Barrel Length', '3.6&quot;'],
  ['Twist Rate', '1:10&quot;'],
  ['Capacity', '10 or 14 rd.'],
]);

function gunOf(markup: string, url: string = URL) {
  const reading = readPage(markup, url, '2026-10-19')[0];
  return reading !== undefined && 'firearm' in reading ? reading.firearm : undefined;
}

function reasonOf(markup: string, url: string = URL): string | undefined {
  const reading = readPage(markup, url, '2026-10-19')[0];
  return reading !== undefined && 'skipped' in reading ? reading.skipped : undefined;
}

describe('reading a published specification', () => {
  it('reads the heading without the trade marks printed on it', () => {
    expect(heading(PISTOL)).toBe('Example Pistol-40 Compact');
    expect(heading('<html><body>no heading</body></html>')).toBeUndefined();
  });

  it('writes the gun from the labels of the Specs list', () => {
    const gun = gunOf(PISTOL);
    expect(gun?.name).toBe('FN Example Pistol-40 Compact');
    expect(gun?.model).toBe('Example Pistol-40 Compact');
    expect(gun?.cartridge).toBe('40 S&W');
    expect(gun?.barrel.length).toBe(0.09144);
    expect(gun?.barrel.twistLength).toBe(0.254);
    expect(gun?.barrel.gunMass).toBe(0.731418);
    expect(gun?.source).toMatchObject({ kind: 'published', publisher: 'FN America, LLC', url: URL, retrieved: '2026-10-19', massBasis: 'unstated' });
    expect(gun?.source?.published).toMatchObject({ caliber: '40 S&W', barrelLength: '3.6"', weight: '25.8 oz.', twist: '1:10"' });
  });

  it('reads no barrel length from the label below an empty one', () => {
    // FN's M16A4: an empty `Barrel Length` and an overall length under it. The gun is skipped whole.
    const m16a4 = page('Example M16A4', [['Caliber', '5.56 NATO'], ['Barrel Length', ''], ['Overall Length', '39.63&quot;'], ['Weight', '8.5 lb.']]);
    expect(reasonOf(m16a4)).toBe('Example M16A4: no barrel length or no weight a gun can have');
  });

  it('reads no twist where the cell holds the twists of two cartridges', () => {
    const rifle = page('Example SPR', [
      ['Caliber', '.308 Win'],
      ['Barrel Length', '20&quot;'],
      ['Weight', '11.3 lb.'],
      ['Twist Rate', '1:10&quot; RH (.300); 1:12&quot; RH (.308)'],
    ]);
    const gun = gunOf(rifle);
    expect(gun?.barrel.twistLength).toBeUndefined();
    expect(gun?.source?.published).toMatchObject({ twist: '1:10" RH (.300); 1:12" RH (.308)' }); // kept as printed
  });

  it('reads no gun from a page that gives no weight: it is the only mass this maker publishes', () => {
    expect(reasonOf(page('Example Carbine', [['Caliber', '5.56 NATO'], ['Barrel Length', '16&quot;']]))).toBe(
      'Example Carbine: no barrel length or no weight a gun can have',
    );
  });

  it('leaves out what is not a complete gun: an accessory section, or a name that says part', () => {
    expect(reasonOf(PISTOL, 'https://example.invalid/products/accessories/example-plate/')).toBe(
      'not a firearm: an accessory, suppressor or launcher section',
    );
    const upper = page('Example 15 Upper Receiver Assembly', [['Caliber', '5.56 NATO'], ['Barrel Length', '16&quot;'], ['Weight', '4.5 lb.']]);
    expect(reasonOf(upper)).toBe('Example 15 Upper Receiver Assembly: named like a part or a set, not a complete gun');
  });

  it('leaves out a page whose caliber is one nobody reloads for', () => {
    const marking = page('Example FX', [['Caliber', '9mm FX'], ['Barrel Length', '4&quot;'], ['Weight', '25 oz.']]);
    expect(reasonOf(marking)).toBe('Example FX: no loadable cartridge (9mm FX)');
  });
});
