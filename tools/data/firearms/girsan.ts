/**
 * Reads Girsan's published pistol specifications into gun files (issue #30). Maintainer tool, written
 * like glock.ts.
 *
 *     deno run -A tools/data/firearms/girsan.ts <output folder> [--limit 5]
 *
 * Pages read: the `product-detail.php?weapon=` pages of `girsan.com/sitemap.xml` (about 105, a second
 * apart; the Turkish `?lang=tr` copies are not read). The site was rebuilt in November 2026: before, the
 * pages were WordPress `/urun/` pages with the figures in Elementor headings.
 *
 * How the figures sit in a page: the page declares its own gun to its script, `detailDB['<slug>'] = {
 * name: "MC 9 BLACK", …, specs: { "GENERAL DATA": { "Caliber": "9x19 mm", … }, "DIMENSIONS & WEIGHT":
 * { "Barrel Length": "108 mm", "Weight (Empty)": "700 gr" }, … } }`. Each label and value is a quoted
 * string in that block, read in order; the other guns the page lists (its `dbList`) carry no figure.
 * One page is one finish of one model (`MC 28 Black`, `MC 28 OD Green`), and each is a record of its
 * own.
 *
 * What the units are:
 *  - Barrel lengths are printed in millimetres (`120.5 mm`). A length printed with no unit (`118.50`)
 *    is not read: the project reads no unit-less figure, and the checker would read it as inches.
 *  - Weights are printed `740 gr.` The abbreviation is the Turkish `gram`, not the grain: the figures
 *    run from 610 to 1190, a pistol's weight in grams and a gun of 40 to 80 grams if they were grains.
 *    The record's mass is that figure in grams and `published.weight` keeps the page's `740 gr.` as
 *    printed, the checker having been taught that a gun's `gr` is grams. The old pages said `Weight
 *    (Empty, without magazine)`: `without-magazine`. The rebuilt ones say `Weight (Empty)`, which does
 *    not say whether the magazine is in: `unstated`.
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

const SITEMAP = 'https://www.girsan.com/sitemap.xml';

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

/** The gun a page declares to its script: its name and its specification's labels and values, in order. */
export function declaredGun(page: string): { name: string; specifications: Array<{ label: string; value: string }> } | undefined {
  const start = page.search(/detailDB\['[a-z0-9-]+'\]\s*=\s*\{/);
  if (start < 0) return undefined;
  const end = page.indexOf('colors:', start);
  const block = page.slice(start, end < 0 ? undefined : end);
  const name = /\bname:\s*("(?:[^"\\]|\\.)*")/.exec(block)?.[1];
  if (name === undefined) return undefined;
  const specificationsStart = block.indexOf('specs:');
  const specifications = specificationsStart < 0 ? [] : [...block.slice(specificationsStart).matchAll(/("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/g)]
    .map(([, label, value]) => ({ label: plainText(JSON.parse(label!) as string), value: plainText(JSON.parse(value!) as string) }));
  return { name: plainText(JSON.parse(name) as string), specifications };
}

/** The label a page actually printed and the value under it. */
function labelled(specifications: Array<{ label: string; value: string }>, label: RegExp): { label: string; value: string } | undefined {
  return specifications.find((specification) => label.test(specification.label));
}

/** The value of a label. */
function valueOf(specifications: Array<{ label: string; value: string }>, label: RegExp): string | undefined {
  return labelled(specifications, label)?.value;
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
  const declared = declaredGun(page);
  if (declared === undefined) return [{ skipped: 'no gun declared' }];
  const texts = declared.specifications;
  const caliber = valueOf(texts, /^Caliber$/i);
  const barrelText = valueOf(texts, /^Barrel Length$/i);
  const weightHeading = labelled(texts, /^Weight\b/i);
  const weightText = weightHeading?.value;
  const name = readableName(declared.name);
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
        // Their label says what the figure covers — `Weight (Empty, without magazine)` — and a page
        // that only says `Weight` is taken at its word, which is that it does not say.
        massBasis: /without\s+magazine/i.test(weightHeading?.label ?? '') ? 'without-magazine' : 'unstated',
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
  const urls = [...decodeEntities(await fetchText(SITEMAP)).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!).filter((url) => /\/product-detail\.php\?weapon=[a-z0-9-]+$/.test(url));
  await crawl('girsan', urls, readPage);
}

if (import.meta.main) await main();
