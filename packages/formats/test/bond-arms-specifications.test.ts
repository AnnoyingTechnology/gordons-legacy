import { describe, expect, it } from 'vitest';
import { modelFromTitle, modelPages, readPage } from '../../../tools/data/firearms/bond-arms.ts';

/**
 * Reading Bond Arms' published handgun specifications (tools/data/firearms/bond-arms.ts, issue #30). The
 * pages below are in the shape of Bond Arms' model pages — a title and a table of row headers and values
 * — with invented models and figures.
 *
 * What this maker's shape costs: a derringer takes interchangeable barrels, so one caliber cell lists
 * several chamberings (`.45 ACP, 9mm`), each one gun; the one weight printed then belongs to none of them
 * for certain; and a barrel for a shotshell and a cartridge at once (`.45LC/.410`) is no gun to load for.
 */
function page(title: string, rows: Record<string, string>): string {
  const body = Object.entries(rows)
    .map(([label, value]) => `<tr><th class="rowHeader">\n ${label}\n</th>\n<td>\n ${value}\n</td></tr>`)
    .join('\n');
  return `<html><head><title>Bond Arms | ${title}</title></head><body><table>${body}</table></body></html>`;
}

function readingsOf(markup: string) {
  return readPage(markup, 'https://example.invalid/bond-arms-handguns/example/', '2026-11-02');
}

describe("reading Bond Arms' model pages", () => {
  it('names the model without the shop words around it', () => {
    expect(modelFromTitle(page('Backup (While Supplies Last)', {}))).toBe('Backup');
    expect(modelFromTitle(page('Bond Arms Girl Mini', {}))).toBe('Girl Mini');
  });

  it('reads a model sold in one chambering with its weight', () => {
    const [reading] = readingsOf(page('Example Mini', { Caliber: '.45 LC', 'Barrel Length': '2.5&quot;', Weight: '19 ounces' }));
    const gun = reading !== undefined && 'firearm' in reading ? reading.firearm : undefined;
    expect(gun!.name).toBe('Bond Arms Example Mini .45 LC');
    expect(gun!.barrel.length).toBeCloseTo(2.5 * 0.0254, 9);
    // Rounded to the milligram, as every record is (`tidy`).
    expect(gun!.barrel.gunMass).toBeCloseTo((19 * 0.45359237) / 16, 6);
  });

  it('makes one gun per listed chambering, without a weight none of them is sure to have', () => {
    const readings = readingsOf(page('Example', { Caliber: '.45 ACP, 9mm, .45LC/.410', 'Barrel Length': '2.5&quot;', Weight: '19 ounces' }));
    const guns = readings.flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
    expect(guns.map((gun) => gun.cartridge)).toEqual(['.45 ACP', '9mm']);
    expect(guns.every((gun) => gun.barrel.gunMass === undefined)).toBe(true);
    expect(readings.flatMap((reading) => ('skipped' in reading ? [reading.skipped] : []))).toEqual(['Example .45LC/.410: not one cartridge a reloader loads']);
  });

  it('reads the model pages of the sitemap, not the listing or the videos', () => {
    expect(
      modelPages([
        'https://www.bondarms.com/bond-arms-handguns/',
        'https://www.bondarms.com/bond-arms-handguns/backup/',
        'https://www.bondarms.com/bond-arms-handguns/videos/',
        'https://www.bondarms.com/shop/grips/mama-bear-grip/',
      ]),
    ).toEqual(['https://www.bondarms.com/bond-arms-handguns/backup/']);
  });
});
