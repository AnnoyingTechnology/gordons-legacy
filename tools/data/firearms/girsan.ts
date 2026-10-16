/**
 * Reads Girsan's published pistol specifications into gun files (issue #30). Maintainer tool, written
 * like glock.ts.
 *
 *     deno run -A tools/data/firearms/girsan.ts <output folder> [--limit 5]
 *
 * Pages read: the `/urun/` (product) pages of `girsan.com/wp-sitemap-posts-product-1.xml`, the English
 * tree (about 115, a second apart). The `/tr/` tree is the same catalogue in Turkish and is not read.
 *
 * How the figures sit in a page: Elementor headings in pairs, the label and then the value, each in an
 * `<h2 class="elementor-heading-title">`: `Caliber`, `Weight (Empty, without magazine)`, `Barrel
 * Length`, `Rifling`. One page is one finish of one model (`MC 28 Black`, `MC 28 OD Green`), and each
 * is a record of its own.
 *
 * What the units are:
 *  - Barrel lengths are printed in millimetres (`120.5 mm`). A length printed with no unit (`118.50`)
 *    is not read: the project reads no unit-less figure, and the checker would read it as inches.
 *  - Weights are printed `740 gr.` The abbreviation is the Turkish `gram`, not the grain: the figures
 *    run from 610 to 1190, a pistol's weight in grams and a gun of 40 to 80 grams if they were grains.
 *    The record's mass is that figure in grams and `published.weight` keeps the page's `740 gr.` as
 *    printed, the checker having been taught that a gun's `gr` is grams. The page says the weight is
 *    the empty gun without its magazine: `without-magazine`.
 *  - The `Rifling` line (`6 Units (250 mm) Facing Right`) does not say plainly that 250 mm is the
 *    length of a turn, so no twist is recorded.
 *
 * The page writes the caliber many ways (`9mm x19`, `9X19 mm`, `.45ACP`); they are mapped to the
 * conventional names in a table, the maker's own word kept in `published.caliber`.
 *
 * Left out, and counted in the skip list: shotguns (the `12 GA` MC 312), a weight with a tolerance
 * (`845+/-5 gr.`), a barrel length without a unit, and anything without a loadable cartridge.
 */
import { units } from '@gordons-legacy/formats';
import { loadableCartridge } from './loadable-cartridge.ts';
import { decodeEntities, fetchText, plainText, plausibleGunMass } from './maker-site.ts';
import { crawl, firearmRecord, readableName, tidy, withMaker, type PageReading } from './printed-figures.ts';

const SITEMAP = 'https://www.girsan.com/wp-sitemap-posts-product-1.xml';

/** The conventional names of the cartridges the pages write in several ways; others are kept as written. */
const CARTRIDGE_NAMES: Record<string, string> = {
  '9MM X19': '9x19 mm',
  '9X 19 MM': '9x19 mm',
  '9X19 MM': '9x19 mm',
  '9X19MM': '9x19 mm',
  '.45ACP': '.45 Auto',
  '.380ACP': '.380 Auto',
  '.38SUPER': '.38 Super',
  '10 MM': '10mm Auto',
};

/** The label and value pairs of a page: every Elementor heading, in order. */
export function headings(page: string): string[] {
  return [...page.matchAll(/<h2 class="elementor-heading-title[^>]*>([\s\S]*?)<\/h2>/g)].map(([, text]) => plainText(text!));
}

/** The value that follows a label in the page's headings. */
function valueOf(texts: string[], label: RegExp): string | undefined {
  const index = texts.findIndex((text) => label.test(text));
  return index < 0 ? undefined : texts[index + 1];
}

/** `120.5 mm` → metres. A length with another unit, or none, is not read. */
export function barrelLength(text: string): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*mm\.?$/i.exec(text.trim());
  return match === null ? undefined : tidy(Number(match[1]) * units.MILLIMETRE);
}

/** `740 gr.` → kilograms, `gr` being the abbreviation of gram (see the header). */
export function weight(text: string): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*gr\.?$/i.exec(text.trim());
  return match === null ? undefined : plausibleGunMass(tidy(Number(match[1]) * units.GRAM));
}

/** The gun a page describes, or the reason it is not one. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const title = /<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/.exec(page)?.[1];
  if (title === undefined) return [{ skipped: 'no product heading' }];
  const texts = headings(page);
  const caliber = valueOf(texts, /^Caliber$/i);
  const barrelText = valueOf(texts, /^Barrel Length$/i);
  const weightText = valueOf(texts, /^Weight\b/i);
  const name = readableName(plainText(title));
  if (caliber === undefined) return [{ skipped: `${name}: no caliber` }];
  const cartridge = CARTRIDGE_NAMES[caliber.toUpperCase()] ?? caliber;
  if (!loadableCartridge(cartridge)) return [{ skipped: `${name}: no loadable cartridge (${caliber})` }];
  const length = barrelText === undefined ? undefined : barrelLength(barrelText);
  if (length === undefined) return [{ skipped: `${name}: no barrel length in millimetres (${barrelText ?? 'none printed'})` }];
  const mass = weightText === undefined ? undefined : weight(weightText);
  return [
    {
      firearm: firearmRecord({
        maker: 'Girsan',
        publisher: 'Girsan Arms Industry',
        name: withMaker('Girsan', name),
        model: name,
        cartridge,
        barrelLength: length,
        gunMass: mass,
        massBasis: 'without-magazine',
        url,
        retrieved,
        // `740 gr.` is the page's own wording for 740 grams, and it is kept as printed: the checker
        // reads `gr` as grams, since no maker gives a gun's weight in grains (check-corpus.ts).
        published: { caliber, barrelLength: barrelText, weight: mass === undefined ? undefined : weightText },
      }),
    },
  ];
}

async function main(): Promise<void> {
  const urls = [...decodeEntities(await fetchText(SITEMAP)).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!).filter((url) => url.includes('/urun/'));
  await crawl('girsan', urls, readPage);
}

if (import.meta.main) await main();
