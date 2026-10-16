/**
 * Reads Uberti USA's published specifications of its cartridge guns into gun files (issue #30).
 * Maintainer tool.
 *
 *     deno run -A tools/data/firearms/uberti.ts <output folder> [--limit 5]
 *
 * uberti.com redirects to www.uberti-usa.com, a Drupal site. Its sitemap lists one page per model family;
 * the families under `/cartridge-rifles/` and `/cartridge-revolvers/` end in a table with one row per
 * variant (`Caliber`, `Barrel Length`, `Twist Rate`, `Avg. Weight`, and the finishes), the figures in
 * inches and pounds with the twist as `1:16, RH`. The columns are found by their header. The empty cells
 * are in the HTML, so a row keeps its columns even where a finish is missing.
 *
 * Left out: everything under `/black-powder-revolvers/` (cap-and-ball replicas have no cartridge), rows
 * whose caliber is rimfire or names several cartridges, and rows with no barrel length. The weight is
 * one `Avg. Weight` that does not say what it includes, so the mass basis is `unstated`. A revolver's
 * barrel length excludes its cylinder.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.uberti-usa.com/sitemap.xml';

/** The pages that hold cartridge guns; the black-powder ones are not in this list on purpose. */
const CARTRIDGE_PAGE = /^https:\/\/www\.uberti-usa\.com\/cartridge-(rifles|revolvers)\/[a-z0-9-]+$/;

/** A page's specification table: the header cells and the rows, each cell as plain text (empty ones kept). */
export interface Table {
  header: string[];
  rows: string[][];
}

/** The columns of the table the record reads, found by the words of their header, in English. */
const COLUMNS = {
  model: /^model$/i,
  description: /^model description$/i,
  cartridge: /^caliber$/i,
  barrelLength: /^barrel length$/i,
  twist: /^twist rate$/i,
  weight: /^(avg\.? )?weight$/i,
} as const;

/** The table of a page that has a caliber and a barrel length column, or nothing. */
export function specificationTable(page: string): Table | undefined {
  for (const [, body] of page.matchAll(/<table[^>]*>(.*?)<\/table>/gs)) {
    const header = [...body!.matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map(([, cell]) => plainText(cell!));
    if (!header.some((cell) => COLUMNS.cartridge.test(cell)) || !header.some((cell) => COLUMNS.barrelLength.test(cell))) continue;
    const rows = [...body!.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)]
      .map(([, row]) => [...row!.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(([, cell]) => plainText(cell!)))
      .filter((cells) => cells.length === header.length);
    return { header, rows };
  }
  return undefined;
}

/** A barrel length in metres from `5.5"` or `16.125"`: inches only, and nothing for a list or a range. */
export function barrelLength(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*"$/.exec(text ?? '');
  return match ? Number(match[1]) * units.INCH : undefined;
}

/** A mass in kilograms from `2.3 lbs` or `8 lbs`; a figure that cannot be a gun's is nothing. */
export function mass(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*lbs?\.?$/i.exec(text ?? '');
  return plausibleGunMass(match ? Number(match[1]) * units.POUND : undefined);
}

/**
 * The longest turn of rifling taken, m. The 1876 Centennial prints `1:48`, a slow black-powder twist
 * (1.22 m per turn) that the corpus checker takes for an error; it stays in `source.published` and is
 * not made a twist, since a figure the check cannot vouch for must not reach the engine.
 */
const LONGEST_TWIST = 1.2;

/** The twist in metres per turn from `1:16, RH`: inches, the hand of the rifling ignored. */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^1\s*:\s*([0-9]+(?:\.[0-9]+)?)(?:\s*"|\s*in\b)?\s*(?:,\s*[LR]H)?$/i.exec(text ?? '');
  const twist = match ? Number(match[1]) * units.INCH : undefined;
  return twist !== undefined && twist > 0 && twist <= LONGEST_TWIST ? twist : undefined;
}

/**
 * A cartridge a reloader loads for from the caliber cell: one cartridge, with a figure in it, no rimfire.
 * `.45 Colt/.45 ACP` and `.357 Mag or .38 Special` name two cartridges at once, so they are left out.
 */
export function loadable(cartridge: string): boolean {
  // A bare calibre (`.44`) could as well be a cap-and-ball revolver as a cartridge: it is not a cartridge name.
  if (!/[0-9]/.test(cartridge) || /^\.?[0-9]+$/.test(cartridge.trim())) return false;
  // `.45/70` and `.44/40` are one cartridge written the old way; any other slash joins two.
  if (/\/|\bor\b|&|\band\b|,/i.test(cartridge.replace(/^\.?[0-9]{2,3}\/[0-9]{2,3}\b/, ''))) return false;
  return !/(^|[^0-9])(22|17)\s*(lr|long rifle|wmr|hmr|wsm|short|magnum|mag)\b/i.test(cartridge);
}

/** The page's title before its pipe: `1873 Rifle and Carbine | Uberti USA Replica Rifles and Revolvers`. */
export function familyFromTitle(page: string): string | undefined {
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title).split(/\s\|\s/)[0]?.trim() || undefined;
}

/** The guns of one page: one per row of its table. */
export function firearmsFrom(page: string, url: string, retrieved: string): Firearm[] {
  const table = specificationTable(page);
  if (table === undefined) return [];
  const column = (pattern: RegExp) => table.header.findIndex((cell) => pattern.test(cell));
  const columns = Object.fromEntries(Object.entries(COLUMNS).map(([key, pattern]) => [key, column(pattern)]));
  const guns: Firearm[] = [];
  for (const row of table.rows) {
    const cell = (key: keyof typeof COLUMNS) => (columns[key]! >= 0 ? row[columns[key]!] : undefined);
    const cartridge = cell('cartridge');
    const length = barrelLength(cell('barrelLength'));
    const model = cell('model');
    if (!cartridge || !loadable(cartridge) || length === undefined || !model) continue;
    const variant = cell('description');
    const gunMass = mass(cell('weight'));
    const twist = twistLength(cell('twist'));
    const name = ['Uberti', model, variant, cartridge].filter((word) => word).join(' ');
    guns.push({
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Uberti',
      model: [model, variant].filter((word) => word).join(' '),
      cartridge,
      barrel: {
        name,
        length,
        ...(twist === undefined ? {} : { twistLength: twist }),
        ...(gunMass === undefined ? {} : { gunMass }),
        gasLeaks: [],
      },
      source: {
        kind: 'published',
        publisher: 'Uberti',
        url,
        retrieved,
        // "Avg. Weight" is the only weight and the table does not say what it includes.
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
        published: publishedFigures({ caliber: cartridge, barrelLength: cell('barrelLength'), weight: cell('weight'), twist: cell('twist') }),
      },
    });
  }
  // One family lists a model in several barrel lengths under one name: those are different guns, so the
  // barrel length joins the name. Rows that still agree on everything are left to the crawl to report.
  const count = new Map<string, number>();
  for (const gun of guns) count.set(gun.name, (count.get(gun.name) ?? 0) + 1);
  return guns.map((gun) => {
    if (count.get(gun.name)! < 2) return gun;
    const name = `${gun.name} ${gun.source?.published?.['barrelLength'] ?? ''}`.trim();
    return { ...gun, name, barrel: { ...gun.barrel, name } };
  });
}

/** What the name clash `a` against `b` is about, in words, for the crawl's log. */
function disagreement(a: Firearm, b: Firearm): string {
  const parts = [`barrel ${(a.barrel.length * 1000).toFixed(1)} mm against ${(b.barrel.length * 1000).toFixed(1)} mm`];
  if (a.barrel.gunMass !== b.barrel.gunMass) parts.push(`mass ${a.barrel.gunMass ?? 'none'} kg against ${b.barrel.gunMass ?? 'none'} kg`);
  return parts.join(', ');
}

async function main(): Promise<void> {
  const args = crawlArguments('uberti', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, url]) => url!)
    .filter((url) => CARTRIDGE_PAGE.test(url))
    .slice(0, limit);
  console.log(`${pages.length} cartridge gun pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const taken = new Map<string, Firearm>();
  for (const url of pages) {
    await sleep(DELAY);
    let page: string;
    try {
      page = await fetchText(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const firearms = firearmsFrom(page, url, retrieved);
    if (firearms.length === 0) skipped.push(`${url}: no row with a loadable caliber and a barrel length`);
    for (const firearm of firearms) {
      const file = fileName(firearm);
      const earlier = taken.get(file);
      if (earlier !== undefined) {
        // Two rows of one name: the name decides the file, so the second is not written, and the
        // difference is printed rather than one of the two chosen silently.
        skipped.push(`${url}: ${firearm.name} is already written; ${disagreement(earlier, firearm)}`);
        continue;
      }
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${json.problem}`);
        continue;
      }
      taken.set(file, firearm);
      writeFileSync(join(folder, file), json.text);
      written++;
      console.log(summaryLine(firearm));
    }
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
