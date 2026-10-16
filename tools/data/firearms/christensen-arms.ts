/**
 * Reads Christensen Arms' published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/christensen-arms.ts <output folder> [--limit 5]
 *
 * christensenarms.com is a WordPress/WooCommerce site. Its `robots.txt` forbids a few landing and
 * training pages only, and names the sitemap index; the products are in `product-sitemap.xml`
 * (`/product/<slug>/`), which also lists accessories, apparel and a gift card — those have no barrel
 * table and are skipped.
 *
 * A rifle's page holds one table of its chamberings, `CALIBER | LENGTH | TWIST` (a gas column for the
 * AR-pattern rifles): `.308 WIN | 24 in. | 1:10`. The page also names one **Starting Weight**
 * (`5.4 LBS`). That is the weight of the lightest configuration, not of each chambering, so it is
 * taken only when the table has a single row, where it can only mean that gun. With several rows it
 * would put the lightest barrel's weight on a 26 in. magnum, which is a guess, and the guns are
 * written without a mass. The product's WooCommerce `weight` field is a shipping weight and is never
 * read.
 *
 * The twist is printed as a bare `1:8`; the inch is the unit of every rifle maker in the United States,
 * and the figure is only kept when it falls where a rifling can (see `check-corpus.ts`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITE = 'https://christensenarms.com';

/** A table of the page: its header cells and its rows, as plain text. */
export interface Table {
  header: string[];
  rows: string[][];
}

/** Every table of a page whose header names a caliber and a barrel length. */
export function chamberingTables(page: string): Table[] {
  const tables: Table[] = [];
  for (const [, body] of page.matchAll(/<table[^>]*>(.*?)<\/table>/gs)) {
    const rows = [...body!.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row]) => [...row!.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map(([, cell]) => plainText(cell!)));
    const header = rows[0];
    if (header && header.some((cell) => /^caliber$/i.test(cell)) && header.some((cell) => /^(barrel )?length$/i.test(cell))) {
      tables.push({ header, rows: rows.slice(1).filter((row) => row.length > 0) });
    }
  }
  return tables;
}

/** The model from a page's headline: `Ridgeline`, without the maker's name. */
export function modelFromHeadline(page: string): string | undefined {
  const headline = /<h1[^>]*>([^<]*)<\/h1>/.exec(page)?.[1];
  const model = headline === undefined ? undefined : plainText(headline).replace(/^Christensen Arms\s+/i, '');
  return model ? model : undefined;
}

/** The **Starting Weight** the page names, as printed (`5.4 LBS`), or nothing. */
export function startingWeight(page: string): string | undefined {
  const match = /<h3>\s*Starting Weight\s*<\/h3>([^<]*)</i.exec(page);
  const text = match === null ? '' : plainText(match[1]!);
  return text === '' ? undefined : text;
}

/** `24 in.` or `24"` → metres. The unit is required. */
export function length(text: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(?:in\b|"|inch)/i.exec((text ?? '').trim());
  return match ? Number(match[1]) * units.INCH : undefined;
}

/** `1:8` or `1:9.3` → metres per turn, taking the inch as the unit; anything else, such as `N/A`, is nothing. */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^1\s*:\s*(\d+(?:\.\d+)?)\s*(?:"|in\b)?$/i.exec((text ?? '').trim());
  const turn = match ? Number(match[1]) : 0;
  return turn > 0 ? turn * units.INCH : undefined;
}

/** `5.4 LBS` → kilograms; a figure no gun has is nothing. */
export function mass(text: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*lbs?\b/i.exec((text ?? '').trim());
  return match ? plausibleGunMass(Number(match[1]) * units.POUND) : undefined;
}

/** A footnote mark Christensen leaves on a caliber (`.338 LAP MAG*`), which is no part of its name. */
export function cartridgeName(text: string): string {
  return text.replace(/\s*\*+$/, '').trim();
}

/**
 * Why a cartridge is not one a reloader loads for, or `undefined` when it is: no figure in it, a
 * rimfire (.22 LR, .22 WMR, .17 HMR, .17 WSM, .17 Mach 2), or several cartridges at once.
 */
export function notLoadable(cartridge: string): string | undefined {
  if (!/[0-9]/.test(cartridge)) return 'no cartridge';
  if (/(^|[^0-9])(22|17)\s*(lr|long rifle|wmr|win\.? mag|hmr|short|wsm|mach 2|hm2)\b/i.test(cartridge)) return 'rimfire';
  if (/[/&]|\bor\b/i.test(cartridge)) return 'several cartridges';
  return undefined;
}

/**
 * The guns of one page: one per row of its chambering table. A cartridge listed twice (two barrel
 * lengths) takes its barrel length into the name, so that no two guns share one.
 */
export function firearmsFrom(page: string, url: string, retrieved: string): { firearms: Firearm[]; skipped: string[] } {
  const firearms: Firearm[] = [];
  const skipped: string[] = [];
  const model = modelFromHeadline(page);
  if (model === undefined) return { firearms, skipped: [`${url}: no headline`] };
  const tables = chamberingTables(page);
  if (tables.length === 0) return { firearms, skipped: [`${url}: no chambering table`] };
  const weight = startingWeight(page);
  for (const table of tables) {
    const column = (pattern: RegExp) => table.header.findIndex((cell) => pattern.test(cell));
    const caliberColumn = column(/^caliber$/i);
    const lengthColumn = column(/^(barrel )?length$/i);
    const twistColumn = column(/^twist$/i);
    const cartridges = table.rows.map((row) => cartridgeName(row[caliberColumn] ?? ''));
    // The Starting Weight only means a gun when the table holds exactly one.
    const soleRow = table.rows.length === 1;
    table.rows.forEach((row, index) => {
      const cartridge = cartridges[index]!;
      const reason = notLoadable(cartridge);
      if (reason !== undefined) {
        skipped.push(`${url}: ${reason}${cartridge === '' ? '' : ` (${cartridge})`}`);
        return;
      }
      const barrelLength = length(row[lengthColumn]);
      if (barrelLength === undefined) {
        skipped.push(`${url}: no barrel length (${cartridge})`);
        return;
      }
      const twist = twistColumn >= 0 ? twistLength(row[twistColumn]) : undefined;
      const gunMass = soleRow ? mass(weight) : undefined;
      const repeated = cartridges.filter((other) => other === cartridge).length > 1;
      const name = `Christensen Arms ${model} ${cartridge}${repeated ? ` ${row[lengthColumn]}` : ''}`;
      firearms.push({
        format: FIREARM_FORMAT,
        schemaVersion: FIREARM_SCHEMA_VERSION,
        name,
        maker: 'Christensen Arms',
        model,
        cartridge,
        barrel: {
          name,
          length: barrelLength,
          ...(twist === undefined ? {} : { twistLength: twist }),
          ...(gunMass === undefined ? {} : { gunMass }),
          gasLeaks: [],
        },
        source: {
          kind: 'published',
          publisher: 'Christensen Arms',
          url,
          retrieved,
          ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
          published: publishedFigures({
            caliber: row[caliberColumn],
            barrelLength: row[lengthColumn],
            weight: gunMass === undefined ? undefined : `Starting Weight ${weight}`,
            twist: twistColumn >= 0 ? row[twistColumn] : undefined,
          }),
        },
      });
    });
  }
  return { firearms, skipped };
}

/**
 * Of guns that share a name, the one they all agree on. Pages list one cartridge and barrel length
 * more than once when they stand for several production runs (a discontinued page can hold three
 * `223 Rem` at 24 inches with three different weights), and a record built from any one of them would
 * be a pick, while an average would be a figure no one printed. Where the figures agree the first is
 * kept; where they differ, none is, and the disagreement is reported.
 */
export function settleNames(firearms: Firearm[]): { kept: Firearm[]; skipped: string[] } {
  const byName = new Map<string, Firearm[]>();
  for (const firearm of firearms) byName.set(firearm.name, [...(byName.get(firearm.name) ?? []), firearm]);
  const kept: Firearm[] = [];
  const skipped: string[] = [];
  for (const [name, candidates] of byName) {
    const first = candidates[0]!;
    const figures = (firearm: Firearm) => JSON.stringify([firearm.barrel.length, firearm.barrel.twistLength, firearm.barrel.gunMass]);
    if (candidates.every((candidate) => figures(candidate) === figures(first))) {
      kept.push(first);
      skipped.push(...candidates.slice(1).map((candidate) => `${candidate.source?.url}: ${name} is listed again with the same figures`));
    } else {
      const printed = candidates.map((candidate) => Object.values(candidate.source?.published ?? {}).join(' / ')).join(' | ');
      skipped.push(`${first.source?.url}: ${name} is listed ${candidates.length} times with different figures, none kept (${printed})`);
    }
  }
  return { kept, skipped };
}

/** The product pages of the sitemap, as full addresses; the shop page and the images are left out. */
export function productAddresses(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, address]) => address!.trim()).filter((address) => /\/product\/[a-z0-9-]+\/$/.test(address));
}

async function main(): Promise<void> {
  const args = crawlArguments('christensen-arms', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = productAddresses(await fetchText(`${SITE}/product-sitemap.xml`)).slice(0, limit);
  console.log(`${pages.length} product pages in the sitemap`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let pagesRead = 0;
  const skipped: string[] = [];
  const found: Firearm[] = [];
  for (const url of pages) {
    await sleep(DELAY);
    let page: string;
    try {
      page = await fetchText(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    pagesRead++;
    const read = firearmsFrom(page, url, retrieved);
    found.push(...read.firearms);
    skipped.push(...read.skipped);
  }
  // Names are settled over the whole crawl, before anything is serialised.
  const settled = settleNames(found);
  skipped.push(...settled.skipped);
  let written = 0;
  for (const firearm of settled.kept) {
    const json = firearmJson(firearm);
    if ('problem' in json) {
      skipped.push(`${firearm.source?.url}: ${json.problem}`);
      continue;
    }
    writeFileSync(join(folder, fileName(firearm)), json.text);
    written++;
    console.log(summaryLine(firearm));
  }
  console.log(`\n${pagesRead} pages read, ${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
