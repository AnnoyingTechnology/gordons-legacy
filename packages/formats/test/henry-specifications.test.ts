import { describe, expect, it } from 'vitest';
import { barrelLength, firearmsFrom, mass, specifications, twistLength } from '../../../tools/data/firearms/henry.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/henry.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — an accordion with one block of labelled
 * values per chambering — and its text is not reproduced; the figures are made up.
 */

function block(title: string, values: Record<string, string>): string {
  // The first values are in rows of their own; the barrel, twist and weight are in a collapsed part of the block.
  const main = ['Model Number', 'Caliber'];
  const row = ([label, value]: [string, string]) => `<div class="specification pt-0 d-flex gap-2"><div class="fw-bold">${label}</div><div class="">${value}</div></div>`;
  const cell = ([label, value]: [string, string]) => `<div class="text-lg-end ps-0 fw-bold pb-1">${label}</div><div>${value}</div>`;
  const entries = Object.entries(values);
  const first = entries.filter(([label]) => main.includes(label)).map(row).join('');
  const more = entries.filter(([label]) => !main.includes(label)).map(cell).join('');
  return `<div class="firearm-specification mb-3" id="x"><h2 class="fs-5">${title}</h2><div class="collapse show">${first}</div><div class="collapse"><div class="specsleft row">${more}</div></div></div>`;
}

const PAGE = `<html><body><div class="accordion firearm-specifications">
${block('Example Lever Rifle .45-70', { 'Model Number': 'X001', Caliber: '<a href="/caliber/45-70/">.45-70</a>', 'Barrel Length': '22&quot;', 'Rate of Twist': '1:20', Weight: '7.5 lbs.' })}
${block('Example Lever Rifle .22 S/L/LR', { 'Model Number': 'X002', Caliber: '.22 S/L/LR', 'Barrel Length': '20&quot;', 'Rate of Twist': '1:16', Weight: '6.5 lbs.' })}
${block('Example Lever Rifle .357 Mag', { 'Model Number': 'X003', Caliber: '.357 Mag', 'Barrel Length': '16.5&quot; / 20&quot;', Weight: '6 lbs.' })}
</div></body></html>`;

describe('reading a published specification', () => {
  it('finds one block of labelled values per chambering', () => {
    const blocks = specifications(PAGE);
    expect(blocks.map((entry) => entry.title)).toEqual(['Example Lever Rifle .45-70', 'Example Lever Rifle .22 S/L/LR', 'Example Lever Rifle .357 Mag']);
    expect(blocks[0]!.values.get('Caliber')).toBe('.45-70');
    expect(blocks[0]!.values.get('Barrel Length')).toBe('22"');
  });

  it('converts the imperial figures, and leaves a range alone', () => {
    expect(barrelLength('22"')).toBeCloseTo(0.5588, 12);
    expect(barrelLength('16.5" / 20"')).toBeUndefined();
    expect(mass('7.5 lbs.')).toBeCloseTo(3.40194278, 7);
  });

  it('reads a twist of inches per turn, and refuses a number that cannot be inches', () => {
    expect(twistLength('1:20')).toBeCloseTo(0.508, 12);
    expect(twistLength('1:250')).toBeUndefined();
    expect(twistLength(undefined)).toBeUndefined();
  });


  it('builds the centerfire guns of a page with their source, and leaves out the rest', () => {
    const guns = firearmsFrom(PAGE, 'https://example.invalid/firearm/example/', '2026-10-15');
    // The rimfire is left out; the .357 has no single barrel length, so it is too.
    expect(guns.map((gun) => gun.name)).toEqual(['Henry Example Lever Rifle .45-70']);
    const gun = guns[0]!;
    expect(gun.maker).toBe('Henry');
    expect(gun.cartridge).toBe('.45-70');
    expect(gun.barrel.length).toBeCloseTo(0.5588, 12);
    expect(gun.barrel.twistLength).toBeCloseTo(0.508, 12);
    expect(gun.barrel.gunMass).toBeCloseTo(3.40194278, 7);
    expect(gun.source).toEqual({
      kind: 'published',
      publisher: 'Henry Repeating Arms',
      url: 'https://example.invalid/firearm/example/',
      retrieved: '2026-10-15',
      massBasis: 'unstated',
      published: { barrelLength: '22"', weight: '7.5 lbs.', twist: '1:20' },
    });
  });
});
