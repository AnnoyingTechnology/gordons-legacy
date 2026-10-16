/**
 * Reads Schmeisser's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/schmeisser.ts <output folder> [--limit 5]
 *
 * schmeisser-germany.com is a WordPress site. Its sitemap lists only the company pages, so the product
 * pages are found by following the links of the English catalogue page (`/en/all-products/`), one
 * page per gun. Each has a "Technical data" block of labelled lines: `Name`, `System`, `Caliber`,
 * `Weight` (`3.250 g`, the dot being a thousands separator), `Barrel` (`37 cm / 14.5″ Free Float`) and
 * `Twist` (`1:9`, a ratio with no unit, read as inches: nothing else is a rifle's twist).
 *
 * Deliberately left out:
 * - the AR15-9 pages: they carry a barrel length in a subtitle and no technical data at all;
 * - a page naming two cartridges (the SP15 LMR pairs `.223 Rem. | .222 Rem.` with `1:9 | 1:12` by
 *   position), and a page whose barrel in centimetres and in inches contradict each other;
 * - a page with no weight is still written (the mass is optional), a page with no barrel is not.
 *
 * The mass is `unstated`: the page gives one weight and does not say what it includes. Its `3.250 g`
 * is kept in `source.published` as `3250 g`, because the checker reads `3.250 g` as three grams.
 *
 * Two pages can carry one name (the SP9 is listed with two barrel lengths): the barrel length is then
 * added to both names and the clash is printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
import { clashes, loadable, printedLength, printedMass, printedTwist, textLines } from './german-speaking-makers.ts';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const CATALOGUE = 'https://schmeisser-germany.com/en/all-products/';
const SITE = 'https://schmeisser-germany.com/en/';

/** Pages of the catalogue's navigation that are not guns. */
const NOT_GUNS = new Set(['all-products', 'contact', 'home-en', 'imprint', 'privacy-policy', 'merchandising', 'comments', 'feed']);

/** The labels of the "Technical data" block, as the page writes them. */
const LABELS = ['Name', 'System', 'Caliber', 'Weight', 'Length', 'Barrel', 'Twist', 'Thread', 'Available colors', 'Erhältlich in', 'Item number', 'Downloads'];

/** The product pages linked from the catalogue page, in the order it lists them. */
export function productLinks(catalogue: string): string[] {
  const links = [...catalogue.matchAll(/href="(https:\/\/schmeisser-germany\.com\/en\/([a-z0-9-]+)\/)"/g)];
  const pages = links.filter(([, , slug]) => !NOT_GUNS.has(slug!)).map(([, url]) => url!);
  return [...new Set(pages)];
}

/**
 * The labelled values of a page's technical data: each label with the lines up to the next label.
 * Empty when the page has no such block.
 */
export function technicalData(page: string): Map<string, string[]> {
  const lines = textLines(page);
  const start = lines.findIndex((line, index) => line === 'Technical data' && lines[index + 1] === 'Name');
  const data = new Map<string, string[]>();
  if (start < 0) return data;
  let label: string | undefined;
  for (const line of lines.slice(start + 1)) {
    if (LABELS.includes(line)) {
      if (line === 'Downloads') break;
      label = line;
      data.set(label, []);
    } else if (label !== undefined) {
      data.get(label)!.push(line);
    }
  }
  return data;
}

/** `3.250 g` as `3250 g`: the maker's figure without the thousands dot a checker would read as a decimal. */
function withoutThousandsDot(weight: string): string {
  return weight.replace(/([0-9])\.([0-9]{3})(\s*g\b)/i, '$1$2$3');
}

/** The gun of one product page, or the reason there is none. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | { skipped: string } {
  const data = technicalData(page);
  if (data.size === 0) return { skipped: 'no technical data' };
  const model = data.get('Name')?.[0];
  const caliber = data.get('Caliber')?.[0];
  const barrel = data.get('Barrel')?.join(' ');
  if (model === undefined || caliber === undefined) return { skipped: 'no model or no caliber' };
  if (data.get('Caliber')!.length > 1 || /[|,;]/.test(caliber)) return { skipped: `several cartridges: ${caliber}` };
  if (!loadable(caliber)) return { skipped: `${caliber} is not a cartridge to load for` };
  if (barrel === undefined) return { skipped: 'no barrel length' };
  const barrelLength = printedLength(barrel);
  if (barrelLength === undefined) return { skipped: `no single barrel length in "${barrel}"` };
  const weight = data.get('Weight')?.join(' ');
  const gunMass = weight === undefined ? undefined : plausibleGunMass(printedMass(weight));
  const twistText = data.get('Twist')?.join(' ');
  const twist = twistText === undefined ? undefined : printedTwist(twistText);
  const name = `Schmeisser ${model}`;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    maker: 'Schmeisser',
    model,
    cartridge: caliber,
    barrel: {
      name,
      length: barrelLength,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Schmeisser GmbH',
      url,
      retrieved,
      // One weight, and the page does not say what it covers.
      ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
      published: publishedFigures({ barrelLength: barrel, weight: weight === undefined ? undefined : withoutThousandsDot(weight), twist: twistText }),
    },
  };
}

async function main(): Promise<void> {
  const args = crawlArguments('schmeisser', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = productLinks(await fetchText(CATALOGUE)).filter((url) => url.startsWith(SITE)).slice(0, limit);
  console.log(`${pages.length} product pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const guns: Firearm[] = [];
  const skipped: string[] = [];
  for (const url of pages) {
    await sleep(DELAY);
    try {
      const result = firearmFrom(await fetchText(url), url, retrieved);
      if ('skipped' in result) skipped.push(`${url}: ${result.skipped}`);
      else guns.push(result);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
    }
  }
  for (const [name, same] of clashes(guns)) {
    console.log(`name clash, kept apart by barrel length: ${name} (${same.map((gun) => `${(gun.barrel.length * 1000).toFixed(1)} mm`).join(', ')})`);
    for (const gun of same) {
      gun.name = gun.barrel.name = `${name} ${Number((gun.barrel.length * 1000).toFixed(1))} mm barrel`;
    }
  }
  let written = 0;
  for (const gun of guns) {
    const json = firearmJson(gun);
    if ('problem' in json) {
      skipped.push(`${gun.name}: ${json.problem}`);
      continue;
    }
    writeFileSync(join(folder, fileName(gun)), json.text);
    written++;
    console.log(summaryLine(gun));
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
