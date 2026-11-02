import { describe, expect, it } from 'vitest';
import { modelFromTitle, modelPages, readPage } from '../../../tools/data/firearms/montana-rifle.ts';

/**
 * Reading Montana Rifle Co.'s published specifications (tools/data/firearms/montana-rifle.ts, issue
 * #30). The pages below are in the shape of the maker's model pages — one table, usually laid out
 * sideways — with invented models and figures.
 *
 * What this maker's shape costs: the table's labels run down the first column and each further column
 * is a gun, except on one page where they run across the top; lengths carry a double prime (`24″`); and
 * a chambering still to come prints `coming soon` where its barrel would be.
 */
function row(cells: string[]): string {
  return `<tr>${cells.map((cell) => `<td><strong>${cell}</strong></td>`).join('')}</tr>`;
}

function page(title: string, rows: string[][]): string {
  return `<html><head><title>${title} - Montana Rifle Co.</title></head><body><table><tbody>${rows.map(row).join('')}</tbody></table></body></html>`;
}

const SIDEWAYS = page('EXAMPLE', [
  ['Caliber', '6.5 Creedmoor', '.308 Win'],
  ['Weight', '6.8lbs', '6.9lbs'],
  ['Twist Rate', '1:8', '1:10'],
  ['Barrel Length', '24&#8243;', '22&#8243;'],
]);

const ACROSS = page('Example hunting rifle', [
  ['Caliber', 'Weight', 'Twist Rate', 'Barrel Length'],
  ['.375 H&amp;H', '8lbs', '1:12', '23&#8243;'],
  ['.458 Lott', 'coming soon', 'coming soon', 'coming soon'],
]);

function readingsOf(markup: string) {
  return readPage(markup, 'https://example.invalid/rifles/example/', '2026-11-02');
}

describe("reading Montana Rifle Co.'s model pages", () => {
  it('names the model from the title', () => {
    expect(modelFromTitle(SIDEWAYS)).toBe('Example');
    expect(modelFromTitle(ACROSS)).toBe('Example');
  });

  it('reads a sideways table, one gun per column, lengths in double primes', () => {
    const guns = readingsOf(SIDEWAYS).flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
    expect(guns.map((gun) => gun.name)).toEqual(['Montana Rifle Company Example 6.5 Creedmoor', 'Montana Rifle Company Example .308 Win']);
    expect(guns[1]!.barrel.length).toBeCloseTo(22 * 0.0254, 9);
    expect(guns[1]!.barrel.twistLength).toBeCloseTo(10 * 0.0254, 9);
    // The shared reader of published strings writes the double prime as the inch sign it is.
    expect(guns[0]!.source?.published).toMatchObject({ barrelLength: '24"', weight: '6.8lbs', twist: '1:8' });
  });

  it('reads a table laid out the other way, and leaves out a chambering still to come', () => {
    const readings = readingsOf(ACROSS);
    const guns = readings.flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
    expect(guns.map((gun) => gun.cartridge)).toEqual(['.375 H&H']);
    expect(readings.some((reading) => 'skipped' in reading && /coming soon/.test(reading.skipped))).toBe(true);
  });

  it('reads the model pages of the page sitemap', () => {
    expect(modelPages(['https://montanarifleco.com/rifles/junction/', 'https://montanarifleco.com/quality/'])).toEqual(['https://montanarifleco.com/rifles/junction/']);
  });
});
