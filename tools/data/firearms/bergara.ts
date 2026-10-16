/**
 * Reads Bergara's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/bergara.ts <output folder> [--limit 5]
 *
 * bergara.online/en is a WordPress site. Each rifle page ends with a "configuration options" table in
 * the HTML: one row per cartridge, with the twist, the weight and the barrel length, in metric figures
 * with the imperial ones beside them (`3,2 kg (7.1 lbs)`, `56 cm (22")`). The columns are found by their
 * header, since the order is not the same on every page.
 *
 * The sitemap's page list gives the rifle pages (`/en/rifles/<series>/<model>/`); the Spanish copies
 * (`/en/esp/...`) are left out. Only the cartridge, the barrel length, the twist and the mass are taken.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.bergara.online/en/page-sitemap.xml';

/** A table of the page: its header cells and its rows, as plain text. */
export interface Table {
  header: string[];
  rows: string[][];
}

/** Every table of a page whose header mentions a twist and a barrel. */
export function configurationTables(page: string): Table[] {
  const tables: Table[] = [];
  for (const [, body] of page.matchAll(/<table[^>]*>(.*?)<\/table>/gs)) {
    const rows = [...body!.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row]) => [...row!.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(([, cell]) => plainText(cell!)));
    const header = rows[0];
    if (header && header.some((cell) => /twist/i.test(cell)) && header.some((cell) => /barrel/i.test(cell))) tables.push({ header, rows: rows.slice(1) });
  }
  return tables;
}

/** The model from a page's title: `B14 Hunter - Rifles Bergara International`. */
export function modelFromTitle(page: string): string | undefined {
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1];
  const model = title === undefined ? undefined : plainText(title).split(/\s[-–|]\s/)[0]?.trim();
  return model ? model.replace(/^Bergara\s+/i, '') : undefined;
}

/** A length in metres from `56 cm (22")` or `560 mm`: the metric figure only, never the inches. */
export function length(text: string | undefined): number | undefined {
  const match = /([0-9]+(?:[.,][0-9]+)?)\s*(cm|mm)\b/.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  return number * (match[2] === 'cm' ? 10 * units.MILLIMETRE : units.MILLIMETRE);
}

/** A mass in kilograms from `3,2 kg (7.1 lbs)`: the metric figure only. */
export function mass(text: string | undefined): number | undefined {
  const match = /([0-9]+(?:[.,][0-9]+)?)\s*kg\b/.exec(text ?? '');
  return plausibleGunMass(match ? Number(match[1]!.replace(',', '.')) : undefined);
}

/**
 * The twist in metres per turn from `1:10"` (inches) or `1:250 mm`. The mark of the unit is required;
 * a bare `1:10` is not guessed at.
 */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^\s*1\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*("|in\b|mm\b)/.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  return number > 0 ? number * (match[2] === 'mm' ? units.MILLIMETRE : units.INCH) : undefined;
}

/** A cartridge a reloader loads for: it has a figure in it, and it is no rimfire. */
export function loadable(cartridge: string): boolean {
  return /[0-9]/.test(cartridge) && !/(^|[^0-9])(22|17)\s*(lr|long rifle|wmr|hmr|wsm|short)\b/i.test(cartridge);
}

/** The guns of one page: one per row of its configuration table. */
export function firearmsFrom(page: string, url: string, retrieved: string): Firearm[] {
  const model = modelFromTitle(page);
  if (model === undefined) return [];
  const guns = new Map<string, Firearm>();
  for (const table of configurationTables(page)) {
    const column = (pattern: RegExp) => table.header.findIndex((cell) => pattern.test(cell));
    const twistColumn = column(/twist/i);
    const weightColumn = column(/weight/i);
    const barrelColumn = column(/barrel/i);
    for (const row of table.rows) {
      const cartridge = row[0];
      const barrelLength = length(row[barrelColumn]);
      if (!cartridge || !loadable(cartridge) || barrelLength === undefined) continue;
      const twist = twistLength(row[twistColumn]);
      const weight = weightColumn >= 0 ? row[weightColumn] : undefined;
      const gunMass = mass(weight);
      const name = `Bergara ${model} ${cartridge}`;
      if (guns.has(name)) continue; // the page repeats its table for narrow screens
      guns.set(name, {
        format: FIREARM_FORMAT,
        schemaVersion: FIREARM_SCHEMA_VERSION,
        name,
        maker: 'Bergara',
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
          publisher: 'Bergara',
          url,
          retrieved,
          // Their table gives one weight and does not say what it covers.
          ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
          published: publishedFigures({ barrelLength: row[barrelColumn], weight, twist: row[twistColumn] }),
        },
      });
    }
  }
  return [...guns.values()];
}

async function main(): Promise<void> {
  const args = crawlArguments('bergara', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, url]) => url!)
    .filter((url) => /\/en\/rifles\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(url))
    .slice(0, limit);
  console.log(`${pages.length} rifle pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const names = new Set<string>();
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
    if (firearms.length === 0) skipped.push(`${url}: no configuration table with a barrel length`);
    for (const firearm of firearms) {
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${json.problem}`);
        continue;
      }
      const file = fileName(firearm);
      if (names.has(file)) continue;
      names.add(file);
      writeFileSync(join(folder, file), json.text);
      written++;
      console.log(summaryLine(firearm));
    }
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
