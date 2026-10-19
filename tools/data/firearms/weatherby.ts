/**
 * Reads Weatherby's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/weatherby.ts <output folder> [--limit 5]
 *
 * Pages read: weatherby.com's rifle category pages (`/product-category/rifles/...`), which link every
 * rifle's product page (`/store/<model>/`), and then each product page. The sitemaps hold no product
 * address, so the pages are found by following links. Shotgun and ammunition pages are not read.
 *
 * How the figures sit: each product page carries a table of "Technical information on each <model>
 * chambering", one row per cartridge, headed Caliber, Weight, Overall Length, ..., Barrel OAL, Twist
 * Rate. Weight is printed in pounds (`5.3lbs.`), the twist as `1:8"`, and Barrel OAL as `24"` or, when a
 * muzzle brake is counted in, `24" (22" barrel + 2" muzzle brake)` — the barrel is then the 22 inches.
 * Every other table of the page is left alone, including the WooCommerce "Additional information"
 * table whose `Weight` is a SHIPPING weight and must never become a gun's mass.
 *
 * Deliberately left out: shotguns, rimfires, the left-hand and right-hand duplicates (the table lists
 * each cartridge once), anything but cartridge, barrel, twist and weight. The page prints one Weight and
 * does not say what it includes, so every mass is `unstated`.
 */
import { fetchPage, pageTitle, plainText } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, type GunFacts, type PageReading } from './printed-figures.ts';
import { barrelLength, chamberings, columnOf, gunMass, tablesOf, twistLength } from './rifle-figures.ts';

const SITE = 'https://weatherby.com';
const CATEGORIES = ['rifles', 'rifles/mark-v', 'rifles/vanguard', 'rifles/model-307', 'rifles/legacy-models', 'rifles/readytoship'];
/** Product pages that are not rifles: shotguns by their series. */
const NOT_RIFLES = /\/store\/(?:orion|sorix|element|18i|d-weatherby)/;

/** The model from a product page's title: `Mark V® Backcountry 2.0 – Weatherby, Inc.`. */
export function modelFromTitle(page: string): string | undefined {
  const model = pageTitle(page)?.split(/\s[–-]\sWeatherby/i)[0]?.trim();
  return model ? model.replace(/^Weatherby\s+/i, '') : undefined;
}

/** The product pages a category page links, without fragments. */
export function productLinks(page: string): string[] {
  const links = [...page.matchAll(/href="(https:\/\/weatherby\.com\/store\/[^"#?]+\/)(?:#[^"]*)?"/g)].map(([, url]) => url!);
  return [...new Set(links)].filter((url) => !NOT_RIFLES.test(url));
}

/** The guns of one product page: one per row of its chambering table. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const model = modelFromTitle(page);
  const guns: GunFacts[] = [];
  const left: string[] = [];
  if (model === undefined) return chamberings(guns, ['no title']);
  for (const table of tablesOf(page)) {
    const caliber = columnOf(table, /^caliber$/i);
    const twist = columnOf(table, /^twist/i);
    const barrel = columnOf(table, /^barrel (oal|length)/i);
    const weight = columnOf(table, /^weight$/i);
    if (caliber < 0 || twist < 0 || barrel < 0) continue; // not the chambering table
    for (const row of table.rows) {
      const cartridge = row[caliber];
      if (!cartridge) continue;
      if (!loadableCartridge(cartridge)) {
        left.push(`${cartridge}: not a cartridge a reloader loads`);
        continue;
      }
      const barrelReading = barrelLength(row[barrel] ?? '');
      if (barrelReading === undefined) {
        left.push(`${model} ${cartridge}: barrel length "${row[barrel] ?? ''}" is not a single barrel`);
        continue;
      }
      guns.push({
        maker: 'Weatherby',
        publisher: 'Weatherby, Inc.',
        name: `Weatherby ${plainText(model)} ${cartridge}`,
        model: plainText(model),
        cartridge,
        barrelLength: barrelReading.value,
        twistLength: twistLength(row[twist] ?? ''),
        gunMass: weight >= 0 ? gunMass(row[weight] ?? '')?.value : undefined,
        url,
        retrieved,
        published: { barrelLength: row[barrel], weight: weight >= 0 ? row[weight] : undefined, twist: row[twist] },
      });
    }
  }
  return chamberings(guns, left);
}

async function main(): Promise<void> {
  const products = new Set<string>();
  for (const category of CATEGORIES) {
    try {
      for (const url of productLinks(await fetchPage(`${SITE}/product-category/${category}/`))) products.add(url);
    } catch (error) {
      console.log(` - ${category}: ${(error as Error).message}`);
    }
  }
  console.log(`${products.size} product pages`);
  await crawl('weatherby', [...products], readPage);
}

if (import.meta.main) await main();
