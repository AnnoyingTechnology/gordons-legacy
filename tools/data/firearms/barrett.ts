/**
 * Reads Barrett's published rifle specifications into gun files (issue #30). Maintainer tool, written
 * like ed-brown.ts.
 *
 *     deno run -A tools/data/firearms/barrett.ts <output folder> [--limit 5]
 *
 * Pages read: the model pages the home page links under `/products/firearms/` (a dozen), a second apart.
 * The sitemaps of barrett.net are nearly all news items, so the models are found by their links.
 *
 * How the figures sit: each page holds one `spec-container` per barrel configuration the model is sold
 * in (`name="fluted"`, `"heavy"`, `"carbonfiber"`, …), and in it one `spec-listing` per chambering, a
 * list of `<li class="caliber|barrel|twist|weight|…"><span class="spec-title">Label</span>value</li>`.
 * A figure is printed in inches with the millimetres beside it (`26" (660 mm)`), the finer of which is
 * kept. A listing that prints several barrels, or several weights, for one chambering (`20" (508 mm)<br>
 * 24" (609.6 mm)`) names a choice, not a gun, and is left out. The weight says nothing of what it
 * includes: `unstated`.
 */
import { fetchText, pageTitle, plainText } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, length, mass, twist, type PageReading } from './printed-figures.ts';

const HOME = 'https://barrett.net/';

/** The model pages the home page links. */
export function modelPages(home: string): string[] {
  const links = [...home.matchAll(/href="(https:\/\/barrett\.net\/products\/firearms\/[^"/]+\/)"/g)].map(([, link]) => link!);
  return [...new Set(links)];
}

/** One chambering of one configuration: the spec list's classes and their values. */
export interface Listing {
  configuration: string;
  figures: Map<string, string>;
}

/** Every listing of a page, with the configuration its container names. */
export function listings(page: string): Listing[] {
  const found: Listing[] = [];
  // Each container runs to the next one: their closing tags are not regular enough to match.
  const containers = page.split(/<ul class="spec-container/).slice(1);
  for (const container of containers) {
    const configuration = /^[^>]*name="([^"]*)"/.exec(container)?.[1] ?? '';
    for (const [, list] of container.matchAll(/<ul class="spec-list[^"]*">([\s\S]*?)<\/ul>/g)) {
      const figures = new Map<string, string>();
      for (const [, name, value] of list!.matchAll(/<li class="([a-z]+)"><span class="spec-title">[^<]*<\/span>([\s\S]*?)<\/li>/g)) {
        // A `<br />` between two figures is two figures, and must not run them together.
        figures.set(name!, plainText(value!.replace(/<br\s*\/?>/gi, ' / ')).replace(/\s*\/\s*$/, ''));
      }
      found.push({ configuration, figures });
    }
  }
  return found;
}

/** The model from a page's title: `MRAD® - Barrett Firearms` → `MRAD`. */
export function modelFromTitle(page: string): string | undefined {
  return pageTitle(page)?.split(/\s[-–]\sBarrett/i)[0]?.replace(/[®™]/g, '').trim() || undefined;
}

/** The guns of one model page: one per chambering of each configuration. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const model = modelFromTitle(page);
  const all = listings(page);
  if (model === undefined || all.length === 0) return [{ skipped: 'no model title or no specification listing' }];
  const configurations = new Set(all.map((listing) => listing.configuration));
  return all.map(({ configuration, figures }): PageReading => {
    const caliber = figures.get('caliber');
    // A configuration named by a number is a barrel length (`name="29"`): the name says it in inches.
    const label = configurations.size < 2 ? '' : /^\d+$/.test(configuration) ? ` ${configuration}"` : ` (${configuration})`;
    if (!caliber || !loadableCartridge(caliber)) return { skipped: `${model}${label}: no single loadable cartridge (${caliber ?? 'none printed'})` };
    const barrelText = figures.get('barrel');
    const barrelLength = barrelText === undefined || barrelText.includes(' / ') ? undefined : length(barrelText);
    if (barrelLength === undefined) return { skipped: `${model}${label} ${caliber}: no single barrel length (${barrelText ?? 'none printed'})` };
    const weightText = figures.get('weight');
    const oneWeight = weightText !== undefined && !weightText.includes(' / ') ? weightText : undefined;
    const twistText = figures.get('twist');
    return {
      firearm: firearmRecord({
        maker: 'Barrett',
        publisher: 'Barrett Firearms Manufacturing, Inc.',
        name: `Barrett ${model} ${caliber}${label}`,
        model,
        cartridge: caliber,
        barrelLength,
        twistLength: twistText === undefined ? undefined : twist(twistText),
        gunMass: oneWeight === undefined ? undefined : mass(oneWeight),
        massBasis: 'unstated',
        url,
        retrieved,
        published: { caliber, barrelLength: barrelText, weight: oneWeight, twist: twistText },
      }),
    };
  });
}

async function main(): Promise<void> {
  await crawl('barrett', modelPages(await fetchText(HOME)), readPage);
}

if (import.meta.main) await main();
