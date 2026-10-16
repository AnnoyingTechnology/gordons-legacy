/**
 * Reads Ed Brown's published 1911 specifications into gun files (issue #30). Maintainer tool, written
 * like glock.ts.
 *
 *     deno run -A tools/data/firearms/ed-brown.ts <output folder> [--limit 5]
 *
 * Pages read: the model pages that `edbrown.com/1911-handguns/` links (about 22, a second apart). The shop's `product-sitemap.xml` (216
 * entries: grips, holsters, magazines, barrels and the same guns again as shop items) is not read: its
 * pages carry no specification, only prose.
 *
 * How the figures sit in a page: a spec box of `<div class="ebp1911-spec"><small>Label</small>
 * <strong>value</strong></div>`, with `Caliber`, `Barrel / slide length` (or `Barrel length`) and
 * `Weight`. The barrel is in inches and sometimes followed by a word (`4.25" reference configuration`,
 * `4.25" Commander`). The weight reads `Approximately 35 oz. with unloaded magazine`: the maker says
 * what it includes, so the basis is `empty-magazine`; the `Approximately` stays in
 * `published.weight`.
 *
 * Left out, and counted in the skip list: a model that prints no caliber (the Kobra Carry is sold in
 * more than one, and the FX2 prints none), and a page whose spec box has no weight or barrel length.
 */
import { fetchText, plainText } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, length, mass, withMaker, type PageReading } from './printed-figures.ts';

const MODELS = 'https://www.edbrown.com/1911-handguns/';
const SITE = 'https://www.edbrown.com';

/** The spec box of a model page: label → value, as printed. */
export function specBox(page: string): Map<string, string> {
  const entries = [...page.matchAll(/<div class="ebp1911-spec"><small>([\s\S]*?)<\/small><strong>([\s\S]*?)<\/strong><\/div>/g)];
  return new Map(entries.map(([, label, value]) => [plainText(label!).toLowerCase(), plainText(value!)] as const));
}

/** The model page links of the models listing. */
export function modelLinks(listing: string): string[] {
  const links = [...listing.matchAll(/class="ebp1911-model-card__link" href="([^"]+)"/g)].map(([, link]) => (link!.startsWith('/') ? SITE + link! : link!));
  return [...new Set(links)];
}

/** The gun a model page describes, or why it is not one. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const title = /<h1 class="entry-title">([\s\S]*?)<\/h1>/.exec(page)?.[1];
  const spec = specBox(page);
  if (title === undefined || spec.size === 0) return [{ skipped: 'no model heading or no spec box' }];
  const model = plainText(title);
  const caliber = spec.get('caliber');
  const barrelText = spec.get('barrel / slide length') ?? spec.get('barrel length');
  const weightText = spec.get('weight');
  if (caliber === undefined || !loadableCartridge(caliber)) return [{ skipped: `${model}: no single loadable cartridge (${caliber ?? 'none printed'})` }];
  const barrelLength = barrelText === undefined ? undefined : length(barrelText);
  if (barrelLength === undefined) return [{ skipped: `${model}: no barrel length` }];
  const gunMass = weightText === undefined ? undefined : mass(weightText);
  // The page says the weight is with an unloaded magazine; any other wording is not claimed to be.
  const massBasis = gunMass !== undefined && /unloaded magazine|empty magazine/i.test(weightText ?? '') ? 'empty-magazine' : 'unstated';
  return [
    {
      firearm: firearmRecord({
        maker: 'Ed Brown',
        publisher: 'Ed Brown Products, Inc.',
        name: withMaker('Ed Brown', model),
        model,
        cartridge: caliber,
        barrelLength,
        gunMass,
        massBasis,
        url,
        retrieved,
        published: { caliber, barrelLength: barrelText, weight: weightText },
      }),
    },
  ];
}

async function main(): Promise<void> {
  const links = modelLinks(await fetchText(MODELS));
  await crawl('ed-brown', links, readPage);
}

if (import.meta.main) await main();
