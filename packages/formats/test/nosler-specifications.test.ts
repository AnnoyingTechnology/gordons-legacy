import { describe, expect, it } from 'vitest';
import { gunPages, modelFromTitle, readPage } from '../../../tools/data/firearms/nosler.ts';

/**
 * Reading Nosler's published rifle specifications (tools/data/firearms/nosler.ts, issue #30). The page
 * below is in the shape of Nosler's model pages — a marketing title and a "General Specifications"
 * table, one row per chambering, each cell labelled — with invented figures.
 *
 * What this maker's shape costs: the pages have no heading, so the model comes out of a title wrapped
 * in shop words (`All New … Rifles by Nosler`); and one row misprints its twist (`1.8`), which must cost
 * that gun its twist and nothing else.
 */
function cell(label: string, value: string): string {
  return `<td style="text-align: center;" data-label="${label}">${value}</td>`;
}

function page(title: string, rows: string[][]): string {
  const header = ['Part #', 'Cartridge', 'BBL Length', 'OAL', 'Approx Weight', 'Mag Cap', 'Action Length', 'Twist', 'BBL Contour'];
  const body = rows.map((row) => `<tr>${row.map((value, index) => cell(header[index]!, value)).join('')}</tr>`).join('');
  return `<html><head><title>${title}</title></head><body><p>General Specifications</p>
    <table><thead><tr>${header.map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

const MODEL = page('All New Example 99 Rifles by Nosler', [
  ['40999', '6.5 Creedmoor', '22&quot;', '41.625&quot;', '6.8 lbs', '4', 'Short', '1:8', '#3'],
  ['40998', '26 Nosler', '24&quot;', '44.5&quot;', '7.1 lbs', '3', 'Long', '1.8', '#3'],
  ['40997', '22 LR', '20&quot;', '38&quot;', '5.0 lbs', '10', 'Short', '1:16', '#1'],
]);

function guns() {
  return readPage(MODEL, 'https://example.invalid/example-99-rifles.html', '2026-11-02').flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
}

function reasons() {
  return readPage(MODEL, 'https://example.invalid/example-99-rifles.html', '2026-11-02').flatMap((reading) => ('skipped' in reading ? [reading.skipped] : []));
}

describe("reading Nosler's model pages", () => {
  it('names the model from the title, without the shop words around it', () => {
    expect(modelFromTitle(MODEL)).toBe('Example 99');
    expect(modelFromTitle('<title>Model 48 Mountain Carbon Rifle | Nosler</title>')).toBe('Model 48 Mountain Carbon Rifle');
  });

  it('reads one gun per chambering, with the maker\'s own strings', () => {
    const [creedmoor] = guns();
    expect(creedmoor!.name).toBe('Nosler Example 99 6.5 Creedmoor');
    expect(creedmoor!.barrel.length).toBeCloseTo(22 * 0.0254, 9);
    expect(creedmoor!.barrel.twistLength).toBeCloseTo(8 * 0.0254, 9);
    expect(creedmoor!.barrel.gunMass).toBeCloseTo(6.8 * 0.45359237, 6);
    expect(creedmoor!.source).toMatchObject({ massBasis: 'unstated', published: { barrelLength: '22"', weight: '6.8 lbs', twist: '1:8' } });
  });

  it('keeps a gun whose twist is misprinted, without a twist and without quoting it', () => {
    const nosler = guns()[1]!;
    expect(nosler.cartridge).toBe('26 Nosler');
    expect(nosler.barrel.twistLength).toBeUndefined();
    expect(nosler.source?.published?.['twist']).toBeUndefined();
  });

  it('leaves out a rimfire', () => {
    expect(guns()).toHaveLength(2);
    expect(reasons()).toEqual(['22 LR: not a cartridge a reloader loads']);
  });

  it('reads the rifle and pistol pages of the sitemap, not their category copies, blog posts or ammunition', () => {
    expect(
      gunPages([
        'https://www.nosler.com/model-21-rifles.html',
        'https://www.nosler.com/products/nosler-firearms-html/bolt-action/model-21-rifles-html.html',
        'https://www.nosler.com/blog/post/nosler®-model-21™-rifle-wins-golden-bullseye-at-2023-nraam',
        'https://www.nosler.com/6-5-prc-precision-rifle-cartridge-140gr-ballistic-tipr-ammo-20ct.html',
        'https://www.nosler.com/2024-le-m21-carbon-rifle.html',
      ]),
    ).toEqual(['https://www.nosler.com/model-21-rifles.html', 'https://www.nosler.com/2024-le-m21-carbon-rifle.html']);
  });
});
