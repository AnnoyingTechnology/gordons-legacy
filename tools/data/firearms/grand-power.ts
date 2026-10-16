/**
 * Reads Grand Power's published pistol and rifle specifications into gun files (issue #30).
 * Maintainer tool.
 *
 *     deno run -A tools/data/firearms/grand-power.ts <output folder> [--limit 5]
 *
 * grandpower.eu is a WordPress / WooCommerce site. The product sitemap lists the guns under
 * `/products/product-categories/<category>/.../<model>/`. Each page opens with a short list of labelled
 * values, `<li><strong>Barrel length:</strong><em>96 mm</em></li>`, in metric figures (a few in
 * inches: `11" / 14.5"`). The labels read here are `Caliber`, `Barrel length`, `Twist rate` and one of the
 * weights; `Trigger pull weight` is a force, not a mass, and is never read.
 *
 * The page's own list is the gun's weight. WooCommerce's shipping weight (the product's "additional
 * information" table) is a different field and is not read at all.
 *
 * Left out: a page listing several barrel lengths (`11" / 14.5" / 16.5"`) or several calibers, because
 * the one weight does not belong to any single barrel; rimfire; suppressors, ammunition and other
 * pages with no caliber and no barrel length. The twist is `1:8` with no unit on the pages that give
 * it: a number under 50 cannot be millimetres, so it is taken as inches (the same rule as Henry's).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures, type MassBasis } from './published-figures.ts';

const SITEMAP = 'https://grandpower.eu/product-sitemap.xml';

/** A gun page: two levels or more under the product categories. */
const GUN_PAGE = /^https:\/\/grandpower\.eu\/products\/product-categories\/[a-z0-9-]+\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/;

/** The labelled values of a page's list, label (lower case, no colon) to value, first one wins. */
export function labelledValues(page: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const [, label, value] of page.matchAll(/<li>\s*<strong[^>]*>(.*?)<\/strong>\s*<em>(.*?)<\/em>\s*<\/li>/gs)) {
    const key = plainText(label!).replace(/:\s*$/, '').toLowerCase();
    if (!values.has(key)) values.set(key, plainText(value!));
  }
  return values;
}

/** The gun's name from the page's `<h1 class="product_title">`. */
export function modelFromTitle(page: string): string | undefined {
  const title = /<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>(.*?)<\/h1>/s.exec(page)?.[1];
  const model = title === undefined ? undefined : plainText(title);
  return model || undefined;
}

/** A length in metres from `96 mm`, `5,2 cm` or `4.5"`; a list of several (`11" / 14.5"`) is nothing. */
export function length(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|")$/.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  return number * { mm: units.MILLIMETRE, cm: 10 * units.MILLIMETRE, '"': units.INCH }[match[2] as 'mm' | 'cm' | '"'];
}

/** A mass in kilograms from `680 g`, `2800g` or `1,2 kg`. */
export function mass(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*(kg|g)$/i.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  return plausibleGunMass(match[2]!.toLowerCase() === 'kg' ? number : number * units.GRAM);
}

/**
 * The twist in metres per turn from `1:8`, `1:8"` or `1:203 mm`. A bare number of 50 or more could not
 * be inches and is left out.
 */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^1\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*("|in\b|mm\b)?$/i.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  if (match[2] === undefined) return number > 0 && number < 50 ? number * units.INCH : undefined;
  return number > 0 ? number * (match[2].toLowerCase() === 'mm' ? units.MILLIMETRE : units.INCH) : undefined;
}

/** One cartridge with a figure in it and no rimfire; a pair (`9mm / .40 S&W`) is not one cartridge. */
export function loadable(cartridge: string): boolean {
  if (!/[0-9]/.test(cartridge) || /\/|\bor\b|&amp;|,/i.test(cartridge)) return false;
  return !/(^|[^0-9])(22|17)\s*(lr|long rifle|wmr|hmr|wsm|short|magnum|mag)\b/i.test(cartridge);
}

/**
 * The weight labels and what each mass includes. A label that says only `Weight` gives a figure whose
 * basis is unstated; `with magazine` does not say whether the magazine is loaded, so it is unstated too.
 */
const WEIGHT_LABELS: [RegExp, MassBasis][] = [
  [/^weight (w\/o|without) magazine$/, 'without-magazine'],
  // The page writes `Weight w/ empty magazine`; the slash is sometimes lost in the markup.
  [/^weight (with |w\/? ?)?empty magazine$/, 'empty-magazine'],
  [/^weight$/, 'unstated'],
  [/^weight (with|w\/?) magazine$/, 'unstated'],
];

/** The gun of a page, or nothing when it has no single caliber, no single barrel length, or no title. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | undefined {
  const values = labelledValues(page);
  const model = modelFromTitle(page);
  const cartridge = values.get('caliber');
  const barrelText = values.get('barrel length');
  const barrel = length(barrelText);
  if (model === undefined || cartridge === undefined || !loadable(cartridge) || barrel === undefined) return undefined;
  let weightText: string | undefined;
  let massBasis: MassBasis = 'unstated';
  for (const [label, text] of values) {
    const known = WEIGHT_LABELS.find(([pattern]) => pattern.test(label));
    if (known !== undefined && weightText === undefined) {
      weightText = text;
      massBasis = known[1];
    }
  }
  const gunMass = mass(weightText);
  const twistText = values.get('twist rate');
  const twist = twistLength(twistText);
  const name = /^grand power\b/i.test(model) ? model : `Grand Power ${model}`;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    maker: 'Grand Power',
    model: name.replace(/^Grand Power\s+/i, ''),
    cartridge,
    barrel: {
      name,
      length: barrel,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Grand Power',
      url,
      retrieved,
      ...(gunMass === undefined ? {} : { massBasis }),
      published: publishedFigures({ caliber: cartridge, barrelLength: barrelText, weight: weightText, twist: twistText }),
    },
  };
}

async function main(): Promise<void> {
  const args = crawlArguments('grand-power', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, url]) => url!)
    .filter((url) => GUN_PAGE.test(url))
    .slice(0, limit);
  console.log(`${pages.length} product pages`);
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
    const firearm = firearmFrom(page, url, retrieved);
    if (firearm === undefined) {
      skipped.push(`${url}: no single caliber with a single barrel length`);
      continue;
    }
    const file = fileName(firearm);
    const earlier = taken.get(file);
    if (earlier !== undefined) {
      skipped.push(`${url}: ${firearm.name} is already written (${earlier.source?.url}); barrel ${earlier.barrel.length} m against ${firearm.barrel.length} m, mass ${earlier.barrel.gunMass} kg against ${firearm.barrel.gunMass} kg`);
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
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
