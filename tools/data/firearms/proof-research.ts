/**
 * Reads PROOF Research's published rifle specifications into gun files (issue #30). Maintainer tool,
 * written like ed-brown.ts.
 *
 *     deno run -A tools/data/firearms/proof-research.ts <output folder> [--limit 5]
 *
 * Pages read: the `/rifles/<model>/` pages the home page links (about fifteen), a second apart.
 *
 * How the figures sit: a "Choose Your Caliber" tab list maps `caliber-N` classes to cartridges, and each
 * `caliber-row … caliber-N` holds the rifle's part numbers, one row of spans per part: Part Number,
 * Action, Barrel Length in Inches (`22`), Twist Rate (`8 PXT`, one turn in eight inches on PROOF's
 * carbon barrel), Contour, Muzzle Thread, Color, Price. Parts differing only by hand or colour are one
 * gun; a cartridge with two barrel lengths is two. The barrel's unit is the column's (`in Inches`) and
 * the twist's is the trade's. The page's one weight is a range across the whole model (`5lbs-13oz –
 * 6lbs-12oz`), so no gun gets a mass.
 */
import { units } from '@gordons-legacy/formats';
import { fetchText, pageTitle, plainText } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, tidy, type PageReading } from './printed-figures.ts';

const HOME = 'https://proofresearch.com/';
const SITE = 'https://proofresearch.com';

/** The rifle model pages the home page links, as full addresses with a final slash. */
export function modelPages(home: string): string[] {
  const links = [...home.matchAll(/href="((?:https:\/\/proofresearch\.com)?\/rifles\/[^"/]+)\/?"/g)].map(([, link]) => {
    const full = link!.startsWith('/') ? SITE + link! : link!;
    return `${full}/`;
  });
  return [...new Set(links)];
}

/** The cartridge of each `caliber-N` class, from the tab list. */
export function caliberTabs(page: string): Map<string, string> {
  return new Map([...page.matchAll(/data-mix-filter="\.(caliber-\d+)">([\s\S]*?)<\/span>/g)].map(([, key, name]) => [key!, plainText(name!)] as const));
}

/** One part number's row: the column headers and the cells, as printed. */
export interface PartRow {
  caliberKey: string;
  cells: Map<string, string>;
}

/** Every part row of the page, with its caliber class. */
export function partRows(page: string): PartRow[] {
  const rows: PartRow[] = [];
  for (const block of page.split(/<div class="caliber-row full mix /).slice(1)) {
    const caliberKey = /^(caliber-\d+)/.exec(block)?.[1];
    const header = /<div class="caliber-row-header">([\s\S]*?)<\/div>/.exec(block)?.[1];
    if (!caliberKey || !header) continue;
    const labels = [...header.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(([, label]) => plainText(label!).toLowerCase());
    for (const [, data] of block.matchAll(/<div class="caliber-row-data">([\s\S]*?)<\/div>/g)) {
      const values = [...data!.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(([, value]) => plainText(value!));
      rows.push({ caliberKey, cells: new Map(labels.map((label, index) => [label, values[index] ?? ''] as const)) });
    }
  }
  return rows;
}

/** The model from the title: `Proof Research |   Proof Research Glacier Mountain Hunter` → `Glacier Mountain Hunter`. */
export function modelFromTitle(page: string): string | undefined {
  const title = pageTitle(page)?.split('|').pop()?.replace(/^\s*Proof Research\s+/i, '').trim();
  return title || undefined;
}

/** The guns of one model page: one per cartridge, barrel length and twist among its part numbers. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const model = modelFromTitle(page);
  const tabs = caliberTabs(page);
  const rows = partRows(page);
  if (model === undefined || rows.length === 0) return [{ skipped: 'no model title or no part rows' }];
  const readings = new Map<string, PageReading>();
  for (const { caliberKey, cells } of rows) {
    const cartridge = tabs.get(caliberKey);
    const barrelText = cells.get('barrel length in inches');
    const twistText = cells.get('twist rate');
    const key = `${cartridge}|${barrelText}|${twistText}`;
    if (readings.has(key)) continue; // the same gun in another hand or colour
    if (!cartridge || !loadableCartridge(cartridge)) {
      readings.set(key, { skipped: `${model}: no single loadable cartridge (${cartridge ?? 'none printed'})` });
      continue;
    }
    const inches = barrelText && /^\d+(?:\.\d+)?$/.test(barrelText) ? Number(barrelText) : undefined;
    if (inches === undefined) {
      readings.set(key, { skipped: `${model} ${cartridge}: no barrel length (${barrelText ?? 'none printed'})` });
      continue;
    }
    // `8 PXT` on most pages, a bare `8` on some: one turn in eight inches either way.
    const turn = twistText ? /^(\d+(?:\.\d+)?)(?:\s*PXT)?$/i.exec(twistText)?.[1] : undefined;
    readings.set(key, {
      firearm: firearmRecord({
        maker: 'PROOF Research',
        publisher: 'PROOF Research, Inc.',
        name: `PROOF Research ${model} ${cartridge} ${barrelText}"`,
        model,
        cartridge,
        barrelLength: tidy(inches * units.INCH),
        twistLength: turn === undefined ? undefined : tidy(Number(turn) * units.INCH),
        url,
        retrieved,
        published: { caliber: cartridge, barrelLength: barrelText, twist: turn === undefined ? undefined : twistText },
      }),
    });
  }
  return [...readings.values()];
}

async function main(): Promise<void> {
  await crawl('proof-research', modelPages(await fetchText(HOME)), readPage);
}

if (import.meta.main) await main();
