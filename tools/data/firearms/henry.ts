/**
 * Reads Henry Repeating Arms' published specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/henry.ts <output folder> [--limit 5]
 *
 * Each page of the `firearm` sitemap has a "Specifications" accordion with one block per chambering:
 * model number and cartridge first, then (in a collapsed part of the block, still in the HTML) barrel
 * length, rate of twist and weight. Both parts label their values with a bold `fw-bold` cell. The figures
 * are imperial only.
 *
 * Their robots.txt asks for a crawl delay of ten seconds, so this waits ten seconds between pages;
 * the whole run takes about twenty minutes. Rimfire models, which are most of the line, are left out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.henryusa.com/firearm-sitemap.xml';
/** The crawl delay their robots.txt asks for. */
const DELAY = 10_000;

/** One chambering of a model: its title and its labelled values, as plain text. */
export interface Specification {
  title: string;
  values: Map<string, string>;
}

/** The specification blocks of a page, one per chambering. */
export function specifications(page: string): Specification[] {
  const blocks = page.split('class="firearm-specification').slice(1);
  return blocks.map((block) => {
    const title = plainText(/<h2[^>]*>(.*?)<\/h2>/s.exec(block)?.[1] ?? '');
    const values = new Map<string, string>();
    for (const [, label, value] of block.matchAll(/<div class="[^"]*\bfw-bold\b[^"]*">([^<]*)<\/div>\s*<div[^>]*>(.*?)<\/div>/gs)) {
      if (!values.has(plainText(label!))) values.set(plainText(label!), plainText(value!));
    }
    return { title, values };
  });
}

/** A barrel length in metres from `20"`: inches only, and nothing for a range or a word. */
export function barrelLength(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*"$/.exec(text ?? '');
  return match ? Number(match[1]) * units.INCH : undefined;
}

/** A mass in kilograms from `6.75 lbs.`. */
export function mass(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*lbs?\b/.exec(text ?? '');
  return plausibleGunMass(match ? Number(match[1]) * units.POUND : undefined);
}

/**
 * The twist in metres per turn from `1:16`. The page gives no unit, but it is an American maker whose
 * barrel lengths are in inches; a number of 50 or more could not be inches and is left out.
 */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^1\s*:\s*([0-9]+(?:\.[0-9]+)?)$/.exec(text ?? '');
  const inches = match ? Number(match[1]) : 0;
  return inches > 0 && inches < 50 ? inches * units.INCH : undefined;
}

/** A cartridge a reloader loads for: no rimfire, no shotgun gauge. */
export function loadable(cartridge: string): boolean {
  const rimfire = /(^|[^0-9])(22|17)\s*(s\/l\/lr|s\/l|lr|long rifle|wmr|mag|magnum|win\S* mag|hmr|hm2|short)/i;
  return /[0-9]/.test(cartridge) && !rimfire.test(cartridge) && !/\b[0-9]+\s*(ga|gauge)\b|\.?410\b/i.test(cartridge);
}

/** The guns of one page: one per chambering that has a cartridge and a barrel length. */
export function firearmsFrom(page: string, url: string, retrieved: string): Firearm[] {
  const guns = new Map<string, Firearm>();
  for (const { title, values } of specifications(page)) {
    const cartridge = values.get('Caliber');
    const length = barrelLength(values.get('Barrel Length'));
    if (!title || !cartridge || !loadable(cartridge) || length === undefined) continue;
    const twistText = values.get('Rate of Twist');
    const weight = values.get('Weight');
    const twist = twistLength(twistText);
    const gunMass = mass(weight);
    const name = title.startsWith('Henry') ? title : `Henry ${title}`;
    if (guns.has(name)) continue;
    guns.set(name, {
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Henry',
      ...(values.get('Model Number') === undefined ? {} : { model: values.get('Model Number')! }),
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
        publisher: 'Henry Repeating Arms',
        url,
        retrieved,
        // One weight per chambering, with nothing said about what it covers.
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
        published: publishedFigures({ barrelLength: values.get('Barrel Length'), weight, twist: twistText }),
      },
    });
  }
  return [...guns.values()];
}

async function main(): Promise<void> {
  const args = crawlArguments('henry', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>(?:<!\[CDATA\[)?([^\]<]*)/g)]
    .map(([, url]) => url!)
    .filter((url) => /\/firearm\/[a-z0-9-]+\/$/.test(url))
    .slice(0, limit);
  console.log(`${pages.length} firearm pages`);
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
    if (firearms.length === 0) skipped.push(`${url}: no centerfire chambering with a barrel length`);
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
