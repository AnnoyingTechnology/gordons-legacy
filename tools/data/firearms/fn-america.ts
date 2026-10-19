/**
 * Reads FN America's published firearm specifications into gun files (issue #30). Maintainer tool,
 * written like glock.ts.
 *
 *     deno run -A tools/data/firearms/fn-america.ts <output folder> [--limit 5]
 *
 * Pages read: the product pages of `fnamerica.com/firearm-sitemap.xml` (about 210, a second apart).
 *
 * How the figures sit in a page: a `Specs` list of `<li><strong>Label:</strong> value</li>` lines, with
 * `Caliber`, `Weight`, `Barrel Length` and, on some rifles and pistols, `Twist Rate`. Lengths are in
 * inches (`3.6"`) and weights in ounces or pounds (`25.8 oz.`, `15.44 lb.`). The page gives one weight
 * and does not say what it includes, so every mass is `unstated`. The name is the page's heading.
 *
 * Left out, and counted in the skip list:
 *  - the sitemap lists accessories, suppressors, grenade launchers, less-lethal launchers and training
 *    products next to the firearms: a product in one of those sections, or named like a part (an upper,
 *    a receiver, a kit, a magazine, a barrel), is not a complete gun;
 *  - a page without a caliber, a barrel length and a weight is not read: the gun needs all three here,
 *    since FN's `Weight` is the only mass the page gives;
 *  - rimfire and several-cartridge pages (`loadable` in printed-figures.ts).
 *  - The pages of discontinued guns are read all the same: their owners still load for them.
 */
import { fetchText, plainText, textLines } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, labelled, length, mass, twist, withMaker, type PageReading } from './printed-figures.ts';

const SITEMAP = 'https://fnamerica.com/firearm-sitemap.xml';

/** Sections of the site that are not firearms, from the first two parts of a product's address. */
const NOT_FIREARMS = /\/products\/(accessories|suppressors|pistol-suppressors|grenade-launchers|less-lethal|fn-airborne-pod-systems|e-novation[a-z-]*|law-enforcement\/less-lethal)\//;

/** A name that says the product is a part, a set or a bundle, not a complete gun. */
const PARTS = /\b(uppers?|lowers?|receivers?|kits?|conversions?|magazines?|barrels?|suppressors?|silencers?|launchers?|rails?|stocks?|scopes?|optics?|mounts?|sets?|bundles?|training)\b/i;

/** The product's heading: `FNS™-40 Compact` → `FNS-40 Compact`. */
export function heading(page: string): string | undefined {
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title) || undefined;
}

/** The gun or the reason a page gives none. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  if (NOT_FIREARMS.test(url)) return [{ skipped: 'not a firearm: an accessory, suppressor or launcher section' }];
  const title = heading(page);
  if (title === undefined) return [{ skipped: 'no heading' }];
  if (PARTS.test(title)) return [{ skipped: `${title}: named like a part or a set, not a complete gun` }];
  const lines = textLines(page);
  const caliber = labelled(lines, 'Caliber');
  const barrelText = labelled(lines, 'Barrel Length');
  const weightText = labelled(lines, 'Weight');
  const barrelLength = barrelText === undefined ? undefined : length(barrelText);
  const gunMass = weightText === undefined ? undefined : mass(weightText);
  if (caliber === undefined || !loadableCartridge(caliber)) return [{ skipped: `${title}: no loadable cartridge (${caliber ?? 'none printed'})` }];
  if (barrelLength === undefined || gunMass === undefined) return [{ skipped: `${title}: no barrel length or no weight a gun can have` }];
  const twistText = labelled(lines, 'Twist Rate');
  const name = withMaker('FN', title);
  return [
    {
      firearm: firearmRecord({
        maker: 'FN',
        publisher: 'FN America, LLC',
        name,
        model: name.replace(/^FN\s+/i, ''),
        cartridge: caliber,
        barrelLength,
        twistLength: twistText === undefined ? undefined : twist(twistText),
        gunMass,
        massBasis: 'unstated',
        url,
        retrieved,
        published: { caliber, barrelLength: barrelText, weight: weightText, twist: twistText },
      }),
    },
  ];
}

async function main(): Promise<void> {
  const urls = [...(await fetchText(SITEMAP)).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!).filter((url) => url.includes('/products/'));
  // `products//fn-hp-sfs/`: a sitemap entry with a section missing, which the site answers with a news
  // banner and no specification. The same gun's real address is not guessed.
  const readable = urls.filter((url) => !url.includes('/products//'));
  console.log(`${urls.length - readable.length} sitemap entries with a missing section left out`);
  await crawl('fn-america', readable, readPage);
}

if (import.meta.main) await main();
