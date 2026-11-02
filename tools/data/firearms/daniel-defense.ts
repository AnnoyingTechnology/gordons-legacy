/**
 * Reads Daniel Defense's published specifications into gun files (issue #30). Maintainer tool, written
 * like ed-brown.ts.
 *
 *     deno run -A tools/data/firearms/daniel-defense.ts <output folder> [--limit 5]
 *
 * Pages read: every product page the sitemap names at the top of the site (`/ddm4-v7.html`, about 300
 * of its 375 addresses), a second apart. The category pages can't stand in for that: they show their
 * first page only, and `robots.txt` forbids the `?p=2` that would show the rest. Most products are not
 * guns — barrels, rails, sights, magazines — and a barrel's page prints `Caliber` and `Barrel Length`
 * like a rifle's, so a page is a gun's only when its specification table also names the `Magazine` the
 * gun ships with.
 *
 * How the figures sit: Magento's "More Information" table, `<th class="col label">Label</th><td class="col
 * data">value</td>`, with `Caliber`, `Barrel Length` (`16"`), `Product Weight` (`6.2 LBS`) and `Magazine`.
 * The twist is not in the table but in the build list's `BARREL:` line (`… Cold Hammer Forged, 1:7 Twist,
 * 16" Government Profile, …`), except on the DELTA 5 PRO pages, which print it in the barrel's cell
 * (`24" 1:8"`). The weight's table says nothing of what it includes: `unstated`.
 *
 * Left out, and counted in the skip list: pages without that table, without a single loadable cartridge,
 * or whose barrel cell names more than one length.
 */
import { fetchText, pageTitle, plainText, sitemapLocations, textLines } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, length, mass, twist, withMaker, type PageReading } from './printed-figures.ts';

const SITEMAP = 'https://danieldefense.com/sitemap.xml';

/** The product pages of the sitemap: an address at the top of the site ending in `.html`. */
export function productPages(locations: string[]): string[] {
  return locations.filter((url) => /^https:\/\/danieldefense\.com\/[^/]+\.html$/.test(url));
}

/** The "More Information" table: label → value, as printed. */
export function specificationTable(page: string): Map<string, string> {
  const rows = [...page.matchAll(/<th class="col label"[^>]*>([\s\S]*?)<\/th>\s*<td class="col data"[^>]*>([\s\S]*?)<\/td>/g)];
  return new Map(rows.map(([, label, value]) => [plainText(label!).toLowerCase(), plainText(value!)] as const));
}

/** The build list's barrel line, where the twist is printed: `BARREL: …, 1:7 Twist, …`. */
export function barrelLine(page: string): string | undefined {
  return textLines(page).find((line) => /^BARREL:/i.test(line));
}

/** The gun a product page describes, or why it is not one. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  // Some titles carry the shop's name twice: `… 16" Barrel | Daniel Defense | Daniel Defense`.
  const title = pageTitle(page)?.replace(/(\s*\|\s*Daniel Defense)+\s*$/i, '').trim();
  const table = specificationTable(page);
  if (!title || table.size === 0) return [{ skipped: 'no specification table' }];
  // A discontinued product's page keeps its table but loses its name: a gun without a name is not listed.
  if (/^product discontinued/i.test(title)) return [{ skipped: 'a discontinued product, whose page no longer names it' }];
  if (!table.has('magazine')) return [{ skipped: `${title}: not a gun (no magazine in its specifications)` }];
  const caliber = table.get('caliber');
  if (caliber === undefined || !loadableCartridge(caliber)) return [{ skipped: `${title}: no single loadable cartridge (${caliber ?? 'none printed'})` }];
  const barrelText = table.get('barrel length');
  // The DELTA 5 PRO pages print the twist in the barrel's cell: `24" 1:8"`. The turn is not a second barrel.
  const cellTwist = barrelText === undefined ? undefined : /\s+1\s*:\s*\d+(?:\.\d+)?"?$/.exec(barrelText)?.[0];
  const barrelPrinted = barrelText !== undefined && cellTwist ? barrelText.slice(0, -cellTwist.length).trim() : barrelText;
  const barrelLength = barrelPrinted === undefined ? undefined : length(barrelPrinted);
  if (barrelLength === undefined) return [{ skipped: `${title}: no single barrel length (${barrelText ?? 'none printed'})` }];
  const weightText = table.get('product weight');
  const twistLine = barrelLine(page);
  const twistText = (twistLine === undefined ? undefined : /\b1\s*:\s*\d+(?:\.\d+)?\s*Twist\b/i.exec(twistLine)?.[0]) ?? cellTwist?.trim();
  return [
    {
      firearm: firearmRecord({
        maker: 'Daniel Defense',
        publisher: 'Daniel Defense, LLC',
        name: withMaker('Daniel Defense', title.replace(/^Daniel Defense,\s*/i, 'Daniel Defense ')),
        cartridge: caliber,
        barrelLength,
        twistLength: twistText === undefined ? undefined : twist(twistText),
        gunMass: weightText === undefined ? undefined : mass(weightText),
        massBasis: 'unstated',
        url,
        retrieved,
        // When the twist is in the barrel's cell, each figure quotes its own part of it: `24"` and `1:8"`.
        published: { caliber, barrelLength: barrelPrinted, weight: weightText, twist: twistText },
      }),
    },
  ];
}

async function main(): Promise<void> {
  const pages = productPages(sitemapLocations(await fetchText(SITEMAP)));
  await crawl('daniel-defense', pages, readPage);
}

if (import.meta.main) await main();
