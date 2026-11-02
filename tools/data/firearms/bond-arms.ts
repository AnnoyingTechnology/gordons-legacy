/**
 * Reads Bond Arms' published handgun specifications into gun files (issue #30). Maintainer tool, written
 * like ed-brown.ts.
 *
 *     deno run -A tools/data/firearms/bond-arms.ts <output folder> [--limit 5]
 *
 * Pages read: the model pages under `/bond-arms-handguns/` that the sitemap names (about 20 of its 921
 * addresses, the rest being grips, holsters, accessory barrels and articles), a second apart.
 *
 * How the figures sit: a table of `<th class="rowHeader">Label</th><td>value</td>` rows with `Caliber`,
 * `Barrel Length` (`2.5"`) and `Weight` (`19 ounces`). Bond Arms' derringers take interchangeable
 * barrels, and the caliber cell lists the chamberings a model is sold in (`.45 ACP, 9mm`): each becomes a
 * gun with the model's one barrel length. Which of them the one weight was taken with, the page doesn't
 * say, so a model sold in more than one chambering keeps no weight. A chambering that is not one
 * cartridge (`.45 Colt/.410`, the shotshell-and-cartridge barrels) is left out, as everywhere.
 */
import { fetchText, pageTitle, plainText, sitemapLocations } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, length, mass, type PageReading } from './printed-figures.ts';

const SITEMAP = 'https://www.bondarms.com/sitemap.xml';

/** The model pages of the sitemap: `/bond-arms-handguns/<model>/`, not the listing or the videos. */
export function modelPages(locations: string[]): string[] {
  return locations.filter((url) => /\/bond-arms-handguns\/[^/]+\/$/.test(url) && !/\/videos\/$/.test(url));
}

/** The specification table: label → value, as printed. */
export function specificationTable(page: string): Map<string, string> {
  const rows = [...page.matchAll(/<th class="rowHeader">([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>/g)];
  return new Map(rows.map(([, label, value]) => [plainText(label!).toLowerCase(), plainText(value!)] as const));
}

/** The model from the page's title: `Bond Arms | Backup (While Supplies Last)` → `Backup`. */
export function modelFromTitle(page: string): string | undefined {
  const title = pageTitle(page)
    ?.replace(/^\s*Bond Arms\s*\|\s*/i, '')
    .replace(/^Bond Arms\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  return title || undefined;
}

/** The guns of one model page: one per chambering its caliber cell lists. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const model = modelFromTitle(page);
  const table = specificationTable(page);
  if (model === undefined || table.size === 0) return [{ skipped: 'no model title or no specification table' }];
  const caliberText = table.get('caliber');
  const barrelText = table.get('barrel length');
  if (caliberText === undefined) return [{ skipped: `${model}: no caliber printed` }];
  const barrelLength = barrelText === undefined ? undefined : length(barrelText);
  if (barrelLength === undefined) return [{ skipped: `${model}: no single barrel length (${barrelText ?? 'none printed'})` }];
  const chamberings = caliberText.split(/\s*,\s*/).filter((cell) => cell !== '');
  const weightText = chamberings.length === 1 ? table.get('weight') : undefined;
  return chamberings.map((cartridge): PageReading => {
    if (!loadableCartridge(cartridge)) return { skipped: `${model} ${cartridge}: not one cartridge a reloader loads` };
    return {
      firearm: firearmRecord({
        maker: 'Bond Arms',
        publisher: 'Bond Arms, Inc.',
        name: `Bond Arms ${model} ${cartridge}`,
        model,
        cartridge,
        barrelLength,
        gunMass: weightText === undefined ? undefined : mass(weightText),
        massBasis: 'unstated',
        url,
        retrieved,
        published: { caliber: caliberText, barrelLength: barrelText, weight: weightText },
      }),
    };
  });
}

async function main(): Promise<void> {
  const pages = modelPages(sitemapLocations(await fetchText(SITEMAP)));
  await crawl('bond-arms', pages, readPage);
}

if (import.meta.main) await main();
