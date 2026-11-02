/**
 * Reads Nosler's published rifle specifications into gun files (issue #30). Maintainer tool, written
 * like weatherby.ts, whose table reader it shares (`rifle-figures.ts`).
 *
 *     deno run -A tools/data/firearms/nosler.ts <output folder> [--limit 5]
 *
 * Pages read: the Model 21 and Model 48 pages the sitemap names (about a dozen of its 1,483 addresses,
 * the rest being bullets, ammunition, brass and blog posts), a second apart; `robots.txt` asks nothing.
 * The `products/nosler-firearms-html/...` addresses are category copies of the same pages and are left
 * out.
 *
 * How the figures sit: a "General Specifications" table, one row per chambering, headed Part #,
 * Cartridge, BBL Length, OAL, Approx Weight, Mag Cap, Action Length, Twist, BBL Contour, each cell
 * carrying its column's name in `data-label`. The weight is the table's "approximate" one and says
 * nothing of what it includes, so every mass is `unstated`. A twist the page misprints (`1.8` for the
 * 26 Nosler) is not a twist and is left out of that gun, which keeps its barrel.
 */
import { fetchText, pageTitle, plainText, sitemapLocations } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, type GunFacts, type PageReading } from './printed-figures.ts';
import { barrelLength, chamberings, columnOf, gunMass, tablesOf, twistLength } from './rifle-figures.ts';

const SITEMAP = 'https://www.nosler.com/sitemap.xml';

/** The rifle and pistol pages of the sitemap: Model 21 and Model 48, not their category copies or blog posts. */
export function gunPages(locations: string[]): string[] {
  return locations.filter(
    (url) => /^https:\/\/www\.nosler\.com\/[^/]*(model-21|model-48|m21|m48)[^/]*$/i.test(url) && !/ammo|ammunition|bullet/i.test(url),
  );
}

/**
 * The model from a page's title, without the shop's words around it: `All New Model 21 Rifles by
 * Nosler` → `Model 21`. The pages have no heading element; the title is the only name they print.
 */
export function modelFromTitle(page: string): string | undefined {
  const title = pageTitle(page)?.split(/\s[|–]\s/)[0]?.trim();
  if (!title) return undefined;
  return title
    .replace(/^(all[- ]new|new)\s+/i, '')
    .replace(/\s+by\s+nosler$/i, '')
    .replace(/^nosler\s+/i, '')
    .replace(/\s+(rifles|handguns|pistols)$/i, '')
    .trim();
}

/** The guns of one page: one per row of its specification table. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const model = modelFromTitle(page);
  const guns: GunFacts[] = [];
  const left: string[] = [];
  if (model === undefined) return chamberings(guns, ['no title']);
  for (const table of tablesOf(page)) {
    const cartridgeColumn = columnOf(table, /^cartridge$/i);
    const barrelColumn = columnOf(table, /^bbl length$/i);
    const weightColumn = columnOf(table, /weight/i);
    const twistColumn = columnOf(table, /^twist$/i);
    if (cartridgeColumn < 0 || barrelColumn < 0) continue; // not the specification table
    for (const row of table.rows) {
      const cartridge = row[cartridgeColumn];
      if (!cartridge) continue;
      if (!loadableCartridge(cartridge)) {
        left.push(`${cartridge}: not a cartridge a reloader loads`);
        continue;
      }
      const barrel = barrelLength(row[barrelColumn] ?? '');
      if (barrel === undefined) {
        left.push(`${model} ${cartridge}: barrel length "${row[barrelColumn] ?? ''}" is not a single barrel`);
        continue;
      }
      const twistText = twistColumn >= 0 ? row[twistColumn] : undefined;
      const twist = twistText === undefined ? undefined : twistLength(twistText);
      const weightText = weightColumn >= 0 ? row[weightColumn] : undefined;
      guns.push({
        maker: 'Nosler',
        publisher: 'Nosler, Inc.',
        name: `Nosler ${plainText(model)} ${cartridge}`,
        model: plainText(model),
        cartridge,
        barrelLength: barrel.value,
        twistLength: twist,
        gunMass: weightText === undefined ? undefined : gunMass(weightText)?.value,
        url,
        retrieved,
        // A twist that could not be read is not quoted either: the record keeps no figure it cannot stand behind.
        published: { barrelLength: row[barrelColumn], weight: weightText, twist: twist === undefined ? undefined : twistText },
      });
    }
  }
  return chamberings(guns, left);
}

async function main(): Promise<void> {
  const pages = gunPages(sitemapLocations(await fetchText(SITEMAP)));
  await crawl('nosler', pages, readPage);
}

if (import.meta.main) await main();
