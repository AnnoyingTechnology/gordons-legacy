/**
 * Reads Wilson Combat's published specifications into gun files (issue #30). Maintainer tool, written
 * like ed-brown.ts.
 *
 *     deno run -A tools/data/firearms/wilson-combat.ts <output folder> [--limit 5]
 *
 * Pages read: the site's `robots.txt` asks AI agents for ten seconds between pages and refuses them
 * nothing else, so every page here is ten seconds apart. The products sitemap (2,247 addresses) is
 * mostly parts, magazines, holsters, ammunition and apparel, and a rifle barrel prints `Caliber` and
 * `Barrel Length` like a rifle does. So the guns are found the way a visitor finds them: the category
 * pages under `/handguns/` and `/long-guns/` (about 245) list product links, and only those that the
 * products sitemap also names are read.
 *
 * How the figures sit in a page: the heading (`<h1 class="productView-title …">`) names the gun as
 * the shop sells it, `Protector Carbine, 300 HAM'R, 16" Barrel, 1-15 Twist, Black`, and the
 * Specifications tab is lines of text. A long gun's has `Caliber:`, `Barrel Length: 16" (Non-Fluted,
 * Threaded)`, `Overall Length:` and `Weight Empty: 6 lbs 8 oz`; its twist is printed only in the
 * heading. A pistol's has `Caliber: 9mm` and then the build list, where the barrel is a feature line
 * (`3.6" Stainless Steel match-grade cone barrel, hand fit`) and no weight is printed.
 *
 * When neither prints the barrel (the NULA rifles), the heading's `18" Barrel` is read.
 *
 * Left out, and counted in the skip list: a page with no `Caliber:` or one naming more than one
 * cartridge, a page whose heading names another cartridge than its `Caliber:`, a page with no barrel
 * anywhere, a build list naming two barrels, and the other makers' guns the shop sells (Guncrafter
 * Industries, SIG, CZ, Ruger conversions).
 */
import { decodeEntities, fetchText, plainText, sitemapLocations, sleep, textLines } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, labelled, length, mass, twist, withMaker, type PageReading } from './printed-figures.ts';

const SITE = 'https://wilsoncombat.com';

/** What `robots.txt` asks of AI agents, which this crawl is run by (docs/firearm-data.md, rule 1). */
const DELAY = 10_000;

/** The category pages that list guns, out of the categories sitemap. */
export function gunCategories(categories: string[]): string[] {
  return categories.filter((url) => /^https:\/\/wilsoncombat\.com\/(handguns|long-guns)\//.test(url));
}

/** The product links of a category page that the products sitemap names, once each. */
export function productLinks(page: string, products: ReadonlySet<string>): string[] {
  const links = [...page.matchAll(/href="(https:\/\/wilsoncombat\.com\/[^"#?]+)"/g)].map(([, link]) => link!);
  return [...new Set(links.filter((link) => products.has(link)))];
}

/**
 * The barrel of a pistol's build list: the one line that ends a figure with `barrel` and is not about
 * the slide or a part fitted to the barrel. Two such lines are two barrels, a choice, and give nothing.
 */
export function barrelLine(lines: string[]): string | undefined {
  const candidates = lines.filter((line) => /^\d+(?:\.\d+)?\s*(?:"|”|in\b|inch)/i.test(line) && /\bbarrel\b/i.test(line) && !/\b(bushing|link|slide|guide rod)\b/i.test(line));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Guns the shop sells for other makers, or converts from theirs: not Wilson Combat's to publish. */
const OTHER_MAKERS = /^(guncrafter|sig\b|sig\s*\/|ruger|beretta|cz\b|glock)/i;

/**
 * Whether the heading names the cartridge the specifications give. One page sold a `300 HAM'R` in its
 * heading with `Caliber: 300 Blackout` below: the page contradicts itself, and the gun is left out
 * rather than guessed at. The check asks that every word of four letters or more of the caliber cell
 * (outside brackets) appears in the heading, whole or abbreviated, and so does each of its figures.
 */
export function headingAgrees(heading: string, caliber: string): boolean {
  const words = caliber.replace(/\([^)]*\)/g, '').toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const headingWords = heading.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  // An abbreviation in the heading counts: `.243 WIN` names the `.243 Winchester` of the specifications.
  const wordsAgree = words.every((word) => headingWords.some((headingWord) => word === headingWord || word.startsWith(headingWord)));
  // The figures too: one page prints `Caliber: .6 Blackout` under a heading naming the 8.6 Blackout.
  const numbers = (text: string) => (text.replace(/\([^)]*\)/g, '').match(/\.?\d+(?:\.\d+)?/g) ?? []).map((number) => number.replace(/^\./, ''));
  const headingNumbers = numbers(heading);
  return wordsAgree && numbers(caliber).every((number) => headingNumbers.includes(number));
}

/** The barrel the heading names when the specifications don't: `NULA Model 20S, 300 HAM'R, 18" Barrel, …`. */
export function headingBarrel(heading: string): string | undefined {
  return /\b\d+(?:\.\d+)?"\s*(?:Fluted\s+)?Barrel\b/i.exec(heading)?.[0];
}

/** The gun a product page describes, or why it is not one. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const heading = /<h1 class="productView-title[^"]*">([\s\S]*?)<\/h1>/.exec(page)?.[1];
  if (heading === undefined) return [{ skipped: 'no product heading' }];
  const name = plainText(heading);
  if (OTHER_MAKERS.test(name)) return [{ skipped: `${name}: another maker's gun, sold or converted by the shop` }];
  const lines = textLines(page);
  const caliber = labelled(lines, 'Caliber');
  if (caliber === undefined || !loadableCartridge(caliber)) return [{ skipped: `${name}: no single loadable cartridge (${caliber ?? 'none printed'})` }];
  if (!headingAgrees(name, caliber)) return [{ skipped: `${name}: the heading does not name the \`Caliber: ${caliber}\` below it` }];
  const barrelText = labelled(lines, 'Barrel Length') ?? barrelLine(lines) ?? headingBarrel(name);
  const barrelLength = barrelText === undefined ? undefined : length(barrelText);
  if (barrelLength === undefined) return [{ skipped: `${name}: no barrel length` }];
  const printedWeight = labelled(lines, 'Weight Empty') ?? labelled(lines, 'Weight');
  // The NULA pages print one weight for the whole range, naming the configuration it was weighed in
  // (`4 lb. 13 oz (350 Legend, 16" barrel model, 13.5" LOP)`): not this gun's weight unless it is that one.
  const weightText = printedWeight !== undefined && /\(/.test(printedWeight) ? undefined : printedWeight;
  const twistText = /\b1-\d+(?:\.\d+)?\s*Twist\b/i.exec(name)?.[0];
  return [
    {
      firearm: firearmRecord({
        maker: 'Wilson Combat',
        publisher: 'Wilson Combat',
        name: withMaker('Wilson Combat', name),
        cartridge: caliber,
        barrelLength,
        twistLength: twistText === undefined ? undefined : twist(twistText),
        gunMass: weightText === undefined ? undefined : mass(weightText),
        // `Weight Empty` says without ammunition, not whether a magazine is in: the basis is not claimed.
        massBasis: 'unstated',
        url,
        retrieved,
        published: { caliber, barrelLength: barrelText, weight: weightText, twist: twistText },
      }),
    },
  ];
}

async function main(): Promise<void> {
  const index = await fetchText(`${SITE}/xmlsitemap.php`);
  // The index writes its addresses with `&amp;` between the query's parameters.
  const sitemaps = sitemapLocations(index).map(decodeEntities);
  const sitemapOf = (type: string) => sitemaps.find((location) => location.includes(`type=${type}`));
  await sleep(DELAY);
  const products = new Set(sitemapLocations(await fetchText(sitemapOf('products')!)));
  await sleep(DELAY);
  const categories = gunCategories(sitemapLocations(await fetchText(sitemapOf('categories')!)));
  const links = new Set<string>();
  for (const category of categories) {
    await sleep(DELAY);
    try {
      for (const link of productLinks(await fetchText(category), products)) links.add(link);
    } catch (error) {
      console.log(`category ${category}: ${(error as Error).message}`);
    }
  }
  await crawl('wilson-combat', [...links], readPage, DELAY);
}

if (import.meta.main) await main();
