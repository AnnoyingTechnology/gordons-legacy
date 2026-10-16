import { describe, expect, it } from 'vitest';
import { configurationTables, firearmsFrom, length, mass, modelFromTitle, twistLength } from '../../../tools/data/firearms/bergara.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/bergara.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — a table of configuration options with one
 * row per cartridge — and its text is not reproduced; the figures are made up.
 */

function cell(text: string): string {
  return `<td class="vc_table_cell"><span class="vc_table_content">${text}</span></td>`;
}

function tableRow(cells: string[]): string {
  return `<tr>${cells.map(cell).join('')}</tr>`;
}

const TABLE = `<table class="vc-table-plugin-theme-simple">
${tableRow(['EXAMPLE 7', 'TWIST', 'MUZZLE DIAMETER', 'WEIGHT', 'BARREL LENGHT', 'RRP'])}
${tableRow(['.308 Win.', '1:10&quot;', '16,6 mm', '3,4 kg (7.5 lbs)', '56 cm (22&quot;)', '999 €'])}
${tableRow(['6.5 Creedmoor', '1:8&quot;', '16,6 mm', '3,4 kg (7.5 lbs)', '61 cm (24&quot;)', '999 €'])}
${tableRow(['.22 LR', '1:16&quot;', '16,6 mm', '2,9 kg (6.4 lbs)', '56 cm (22&quot;)', '599 €'])}
</table>`;
/** The page repeats the table for narrow screens. */
const PAGE = `<html><head><title>Example 7 - Rifles Bergara International</title></head><body>${TABLE}<div>${TABLE}</div><table><tr><td>Other</td></tr></table></body></html>`;

describe('reading a published specification', () => {
  it('finds the configuration tables by their header, and no other', () => {
    const tables = configurationTables(PAGE);
    expect(tables).toHaveLength(2);
    expect(tables[0]!.header).toEqual(['EXAMPLE 7', 'TWIST', 'MUZZLE DIAMETER', 'WEIGHT', 'BARREL LENGHT', 'RRP']);
    expect(tables[0]!.rows[0]).toEqual(['.308 Win.', '1:10"', '16,6 mm', '3,4 kg (7.5 lbs)', '56 cm (22")', '999 €']);
  });

  it('finds the model in the title', () => {
    expect(modelFromTitle(PAGE)).toBe('Example 7');
  });

  it('takes the metric figure, never the imperial one beside it', () => {
    expect(length('56 cm (22")')).toBeCloseTo(0.56, 12);
    expect(length('610 mm')).toBeCloseTo(0.61, 12);
    expect(length('22"')).toBeUndefined();
    expect(mass('3,4 kg (7.5 lbs)')).toBeCloseTo(3.4, 12);
    expect(mass('7.5 lbs')).toBeUndefined();
  });

  it('reads the twist in inches or millimetres per turn, and nothing without a unit', () => {
    expect(twistLength('1:10"')).toBeCloseTo(0.254, 12);
    expect(twistLength('1:250 mm')).toBeCloseTo(0.25, 12);
    expect(twistLength('1:10')).toBeUndefined();
  });


  it('builds one gun per cartridge with its twist, its mass and where the figures come from', () => {
    const guns = firearmsFrom(PAGE, 'https://example.invalid/rifles/example-7/', '2026-10-15');
    expect(guns.map((gun) => gun.name)).toEqual(['Bergara Example 7 .308 Win.', 'Bergara Example 7 6.5 Creedmoor']);
    const first = guns[0]!;
    expect(first.maker).toBe('Bergara');
    expect(first.barrel.length).toBeCloseTo(0.56, 12);
    expect(first.barrel.twistLength).toBeCloseTo(0.254, 12);
    expect(first.barrel.gunMass).toBeCloseTo(3.4, 12);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Bergara',
      url: 'https://example.invalid/rifles/example-7/',
      retrieved: '2026-10-15',
      massBasis: 'unstated',
      published: { barrelLength: '56 cm (22")', weight: '3,4 kg (7.5 lbs)', twist: '1:10"' },
    });
  });
});
