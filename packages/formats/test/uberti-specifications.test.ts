import { describe, expect, it } from 'vitest';
import { barrelLength, familyFromTitle, firearmsFrom, mass, specificationTable, twistLength } from '../../../tools/data/firearms/uberti.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/uberti.ts, issue #30). The page
 * below is written here in the shape the maker's pages have: a table with a header of `th` cells and one
 * row per variant, empty cells kept. Its text is not reproduced and the figures are made up.
 */

const HEADER = ['Item Number', 'Model', 'Model Description', 'MSRP', 'Caliber', 'Barrel Length', 'Finish', 'Twist Rate', 'Avg. Weight'];

function row(cells: string[]): string {
  return `<tr>${cells.map((cell) => `<td class="x">${cell}</td>`).join('')}</tr>`;
}

const PAGE = `<html><head><title>Example 99 Rifle | Uberti USA Replica Rifles and Revolvers</title></head><body>
<table class="sortable"><thead><tr>${HEADER.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>
${row(['1', 'Example 99 Rifle', 'Short ', '$1', '.45 Colt', '20&quot;', '', '1:16, RH', '8.2 lbs'])}
${row(['2', 'Example 99 Rifle', 'Short ', '$1', '.357 Mag', '20&quot;', 'Blued', '1:18.75, RH', '8.2 lbs'])}
${row(['3', 'Example 99 Rifle', 'Long ', '$1', '.45 Colt', '24.25&quot;', '', '1:16, RH', '8.5 lbs'])}
${row(['4', 'Example 99 Rifle', 'Long ', '$1', '.45 Colt', '28&quot;', '', '1:16, RH', '9 lbs'])}
${row(['5', 'Example 99 Rifle', 'Plinker', '$1', '.22 LR', '20&quot;', '', '1:16, RH', '5 lbs'])}
${row(['6', 'Example 99 Rifle', 'Two', '$1', '.45 Colt/.45 ACP', '20&quot;', '', '1:16, RH', '8 lbs'])}
${row(['7', 'Example 99 Rifle', 'No unit', '$1', '.44/40', '24.5', '', '1:16, RH', '8 lbs'])}
${row(['8', 'Example 99 Rifle', 'Old way', '$1', '.45/70', '22&quot;', '', '1:20, RH', '9 lbs'])}
</tbody></table></body></html>`;

describe('reading a published specification', () => {
  it('finds the table by its header and keeps the empty cells', () => {
    const table = specificationTable(PAGE)!;
    expect(table.header).toEqual(HEADER);
    expect(table.rows).toHaveLength(8);
    expect(table.rows[0]).toEqual(['1', 'Example 99 Rifle', 'Short', '$1', '.45 Colt', '20"', '', '1:16, RH', '8.2 lbs']);
  });

  it('finds the family in the title', () => {
    expect(familyFromTitle(PAGE)).toBe('Example 99 Rifle');
  });

  it('reads inches, pounds and the twist, and nothing that carries no unit', () => {
    expect(barrelLength('16.125"')).toBeCloseTo(0.409575, 9);
    expect(barrelLength('24.5')).toBeUndefined();
    expect(mass('8.2 lbs')).toBeCloseTo(3.7195, 3);
    expect(mass('9999 lbs')).toBeUndefined();
    expect(twistLength('1:18.75, RH')).toBeCloseTo(0.47625, 9);
    expect(twistLength('1:48, RH')).toBeUndefined();
    expect(twistLength('RH')).toBeUndefined();
  });


  it('builds a gun per loadable row, with the maker\'s strings and an unstated mass basis', () => {
    const guns = firearmsFrom(PAGE, 'https://example.invalid/cartridge-rifles/example-99', '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual([
      'Uberti Example 99 Rifle Short .45 Colt',
      'Uberti Example 99 Rifle Short .357 Mag',
      'Uberti Example 99 Rifle Long .45 Colt 24.25"',
      'Uberti Example 99 Rifle Long .45 Colt 28"',
      'Uberti Example 99 Rifle Two .45 Colt/.45 ACP',
      'Uberti Example 99 Rifle Old way .45/70',
    ]);
    const first = guns[0]!;
    expect(first.barrel.length).toBeCloseTo(0.508, 9);
    expect(first.barrel.twistLength).toBeCloseTo(0.4064, 9);
    expect(first.barrel.gunMass).toBeCloseTo(3.7195, 3);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Uberti',
      url: 'https://example.invalid/cartridge-rifles/example-99',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { caliber: '.45 Colt', barrelLength: '20"', weight: '8.2 lbs', twist: '1:16, RH' },
    });
  });
});
