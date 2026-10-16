import { describe, expect, it } from 'vitest';
import { firearmFrom, productLinks, technicalData } from '../../../tools/data/firearms/schmeisser.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/schmeisser.ts, issue #30). The
 * pages below are written here in the shape the maker's pages have — a "Technical data" block of
 * labelled lines — and their text is not reproduced; the figures are made up.
 */

function line(text: string): string {
  return `<div class="wpb_text_column"><div class="wpb_wrapper"><p>${text}</p></div></div>`;
}

function page(values: Record<string, string>): string {
  const rows = Object.entries(values).map(([label, value]) => `<div class="row"><span class="vcex-heading-inner">${label}</span>${line(value)}</div>`);
  return `<html><body><ul><li>Description</li><li>Technical data</li><li>Downloads</li></ul>
<h3>Technical data</h3>${rows.join('')}<span class="vcex-heading-inner">Downloads</span><p>Manual download</p></body></html>`;
}

const RIFLE = page({
  Name: 'AR15 Example',
  System: 'Semi-Automatic Rifle, Direct Impingement Gas System',
  Caliber: '.223 Rem.',
  Weight: '3.250 g',
  Length: '79,5 cm collapsed, 89,5cm extended',
  Barrel: '37 cm / 14.5&#8243; Free Float',
  Twist: '1:9',
  Thread: '1/2&#215;28 UNEF',
});

describe('reading a published specification', () => {
  it('lists the product pages of the catalogue and leaves out the company pages', () => {
    const catalogue = `<a href="https://schmeisser-germany.com/en/ar15-example/">a</a><a href="https://schmeisser-germany.com/en/contact/">c</a>
      <a href="https://schmeisser-germany.com/en/ar15-example/">again</a><a href="https://schmeisser-germany.com/en/sp9/">b</a>`;
    expect(productLinks(catalogue)).toEqual(['https://schmeisser-germany.com/en/ar15-example/', 'https://schmeisser-germany.com/en/sp9/']);
  });

  it('reads the labelled lines of the technical data, not the tab of the same name', () => {
    const data = technicalData(RIFLE);
    expect(data.get('Name')).toEqual(['AR15 Example']);
    expect(data.get('Barrel')).toEqual(['37 cm / 14.5" Free Float']);
    expect(data.has('Downloads')).toBe(false);
  });

  it('builds the gun with the finer barrel length, the twist in inches and the mass in kilograms', () => {
    const gun = firearmFrom(RIFLE, 'https://example.invalid/en/ar15-example/', '2026-10-16');
    if ('skipped' in gun) throw new Error(gun.skipped);
    expect(gun.name).toBe('Schmeisser AR15 Example');
    expect(gun.cartridge).toBe('.223 Rem.');
    expect(gun.barrel.length).toBeCloseTo(0.3683, 12);
    expect(gun.barrel.twistLength).toBeCloseTo(9 * 0.0254, 12);
    expect(gun.barrel.gunMass).toBeCloseTo(3.25, 12);
    expect(gun.source).toEqual({
      kind: 'published',
      publisher: 'Schmeisser GmbH',
      url: 'https://example.invalid/en/ar15-example/',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { barrelLength: '37 cm / 14.5" Free Float', weight: '3.250 g', twist: '1:9' },
    });
  });

  it('skips a page with two cartridges, which pairs them with twists by position', () => {
    const two = page({ Name: 'SP15 Example', Caliber: '.223 Rem. | .222 Rem.', Weight: '4.000 g', Barrel: '51 cm', Twist: '1:9 | 1:12' });
    expect(firearmFrom(two, 'https://example.invalid/', '2026-10-16')).toEqual({ skipped: 'several cartridges: .223 Rem. | .222 Rem.' });
  });

  it('skips a barrel whose two units contradict each other, and a page with no technical data', () => {
    const wrong = page({ Name: 'SP15 Example', Caliber: '.223 Rem.', Weight: '4.000 g', Barrel: '51 cm / 18&#8243; Fluted' });
    expect(firearmFrom(wrong, 'https://example.invalid/', '2026-10-16')).toMatchObject({ skipped: expect.stringContaining('no single barrel length') });
    expect(firearmFrom('<html><body><h1>AR15-9 Example</h1><p>Barrel 14,5"</p></body></html>', 'https://example.invalid/', '2026-10-16')).toEqual({ skipped: 'no technical data' });
  });

  it('writes a gun without a twist or a mass when the page gives none', () => {
    const bare = page({ Name: 'S9 Example', Caliber: '9x19mm', Weight: '', Barrel: '31,75 cm' });
    const gun = firearmFrom(bare, 'https://example.invalid/', '2026-10-16');
    if ('skipped' in gun) throw new Error(gun.skipped);
    expect(gun.barrel.length).toBeCloseTo(0.3175, 12);
    expect(gun.barrel.twistLength).toBeUndefined();
    expect(gun.barrel.gunMass).toBeUndefined();
    expect(gun.source?.massBasis).toBeUndefined();
  });
});
