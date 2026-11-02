/**
 * Reads Montana Rifle Co.'s published rifle specifications into gun files (issue #30). Maintainer tool,
 * written like weatherby.ts, whose table reader it shares (`rifle-figures.ts`).
 *
 *     deno run -A tools/data/firearms/montana-rifle.ts <output folder> [--limit 5]
 *
 * Pages read: the `/rifles/<model>/` pages of the page sitemap (four of them), ten seconds apart, as
 * `robots.txt` asks (`Crawl-delay: 10`).
 *
 * How the figures sit: one table per page, mostly laid out sideways — the first column holds the
 * labels (Caliber, Weight, Overall Length, Twist Rate, Barrel Length, Mag Capacity) and every other column
 * is a gun; the Tsavo's has the labels across the top instead. Lengths are printed with a double prime (`24″`). The weight says nothing of what it includes:
 * `unstated`.
 */
import { fetchText, pageTitle, plainText, sitemapLocations, sleep } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, type GunFacts, type PageReading } from './printed-figures.ts';
import { barrelLength, chamberings, gunMass, tablesOf, twistLength, type Table } from './rifle-figures.ts';

const SITEMAP_INDEX = 'https://montanarifleco.com/sitemap_index.xml';
const DELAY = 10_000;

/** The model pages of the page sitemap. */
export function modelPages(locations: string[]): string[] {
  return locations.filter((url) => /^https:\/\/montanarifleco\.com\/rifles\/[^/]+\/$/.test(url));
}

/** The model from a page's title: `JUNCTION - Montana Rifle Co.` → `Junction`, `Marshall hunting rifle - …` → `Marshall`. */
export function modelFromTitle(page: string): string | undefined {
  const title = pageTitle(page)?.split(/\s[-–]\sMontana Rifle/i)[0]?.replace(/\s+hunting rifle$/i, '').trim();
  if (!title) return undefined;
  return title === title.toUpperCase() ? title.charAt(0) + title.slice(1).toLowerCase() : title;
}

/**
 * A table as one record per gun: label → that gun's cell. Most pages lay the table out sideways (labels
 * down the first column); the Tsavo's has its labels across the top, one gun per row.
 */
export function gunsOf(table: Table): Array<Map<string, string>> {
  if (table.header.some((cell) => /^barrel length$/i.test(cell))) {
    return table.rows.map((row) => new Map(table.header.map((label, index) => [label.toLowerCase(), (row[index] ?? '').trim()] as const)));
  }
  const rows = [table.header, ...table.rows];
  const width = table.header.length;
  const guns: Array<Map<string, string>> = [];
  for (let column = 1; column < width; column++) {
    guns.push(new Map(rows.map((row) => [(row[0] ?? '').toLowerCase(), (row[column] ?? '').trim()] as const)));
  }
  return guns;
}

/** The double prime (`24″`) and the right double quote are the inch sign. */
function inchSigns(text: string): string {
  return text.replace(/[″”]/g, '"');
}

/** The guns of one model page: one per column of its table. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const model = modelFromTitle(page);
  const guns: GunFacts[] = [];
  const left: string[] = [];
  if (model === undefined) return chamberings(guns, ['no title']);
  const table = tablesOf(page).find((candidate) => /^caliber$/i.test(candidate.header[0] ?? ''));
  for (const gun of table ? gunsOf(table) : []) {
    const cartridge = gun.get('caliber');
    if (!cartridge) continue;
    if (!loadableCartridge(cartridge)) {
      left.push(`${cartridge}: not a cartridge a reloader loads`);
      continue;
    }
    const barrelText = gun.get('barrel length');
    const barrel = barrelText ? barrelLength(inchSigns(barrelText)) : undefined;
    if (barrel === undefined) {
      left.push(`${model} ${cartridge}: barrel length "${barrelText ?? ''}" is not a single barrel`);
      continue;
    }
    const twistText = gun.get('twist rate');
    const weightText = gun.get('weight');
    guns.push({
      maker: 'Montana Rifle Company',
      publisher: 'Montana Rifle Company',
      name: `Montana Rifle Company ${plainText(model)} ${cartridge}`,
      model: plainText(model),
      cartridge,
      barrelLength: barrel.value,
      twistLength: twistText ? twistLength(twistText) : undefined,
      gunMass: weightText ? gunMass(weightText)?.value : undefined,
      url,
      retrieved,
      published: { barrelLength: barrelText, weight: weightText, twist: twistText },
    });
  }
  return chamberings(guns, left);
}

async function main(): Promise<void> {
  const index = sitemapLocations(await fetchText(SITEMAP_INDEX));
  const pageSitemap = index.find((location) => /page-sitemap\.xml$/.test(location));
  if (!pageSitemap) throw new Error('no page sitemap in the index');
  await sleep(DELAY);
  await crawl('montana-rifle', modelPages(sitemapLocations(await fetchText(pageSitemap))), readPage, DELAY);
}

if (import.meta.main) await main();
