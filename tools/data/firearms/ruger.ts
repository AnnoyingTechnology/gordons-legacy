/**
 * Reads Ruger's published firearm specifications into gun files (issue #30). Maintainer tool, built like
 * the Glock one (glock.ts).
 *
 *     node tools/data/firearms/ruger.ts <output folder> [--limit 5]
 *
 * Ruger publishes no sitemap (and no robots.txt), so the walk starts at the home page: it follows the
 * product family pages (`/products/<family>/models.html` and `overview.html`), collects the links to the
 * specification sheets they carry (`/products/<family>/specSheets/<model number>.html`), and reads each
 * sheet. It waits a second between pages and keeps only the figures the simulation needs: the cartridge,
 * the barrel length, the twist when Ruger gives one, and the mass of the gun. Nothing else is taken — no
 * prose, no picture, no price — and every file records the sheet its figures come from.
 *
 * A sheet gives each measure twice, in two spans, the metric one hidden by the page's own unit switch:
 * `<span class='measureI'>2.80"</span><span class='measureM hidden'>71 mm</span>`. The metric figure is
 * the one taken; the inch or ounce figure is the fallback.
 *
 * A published barrel length is nominal. For a rifle it is measured in different ways by different makers,
 * and Ruger does not say how; the files say `published` all the same, and the application shows that.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, parseFirearm, serializeFirearm, units, type Firearm } from '@gordons-legacy/formats';

const SITE = 'https://ruger.com';
const AGENT = 'gordons-legacy-research/1.0 (+https://github.com/AnnoyingTechnology/gordons-legacy)';
/** A second between pages, whatever the site would let us do. */
const DELAY = 1000;
const OUNCE = units.POUND / 16; // kg

/** One line of a sheet's data: its title and its value, with the markup of the value kept. */
interface Specification {
  title: string;
  value: string;
}

export function decode(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&#160;', ' ')
    .replaceAll('&reg;', '')
    .replaceAll('&trade;', '');
}

/** The text of some markup: tags dropped, entities decoded, spaces collapsed. */
function plainText(markup: string): string {
  return decode(markup.replace(/<sup>.*?<\/sup>/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Every titled line of a sheet. Two shapes carry them: the headline lines (`<li>Caliber: <span ...>`)
 * and the small ones (`<li><em>Barrel Length</em><span>...</span></li>`, whose value may hold nested
 * spans, one per unit).
 */
export function specifications(page: string): Specification[] {
  const headline = [...page.matchAll(/<li>\s*([A-Za-z][A-Za-z ]*?):\s*<span[^>]*>([^<]*)<\/span>\s*<\/li>/g)];
  const small = [...page.matchAll(/<li>\s*<em>([^<]*)<\/em>\s*<span[^>]*>(.*?)<\/span>\s*<\/li>/gs)];
  return [...headline, ...small].map(([, title, value]) => ({ title: decode(title ?? '').trim(), value: value ?? '' }));
}

/** The two renderings of a measure: the inch or ounce one, and the metric one; either may be absent. */
function renderings(value: string): { imperial: string; metric: string } {
  const imperial = /class=['"]measureI['"][^>]*>([^<]*)</.exec(value)?.[1];
  const metric = /class=['"]measureM[^'"]*['"][^>]*>([^<]*)</.exec(value)?.[1];
  return { imperial: decode(imperial ?? ''), metric: decode(metric ?? '') };
}

/**
 * A figure as its maker printed it: the value in SI, and what its last digit is worth, also in SI.
 *
 * Ruger prints every measure twice and rounds the two differently — a barrel printed as `18.50"` is
 * 469.9 mm, while the metric span beside it says `46.9 cm` — so taking the metric figure by habit would
 * throw away a digit the maker published. The finer step wins instead, whichever unit it is in.
 */
interface Reading {
  /** SI: metres or kilograms. */
  value: number;
  /** SI value of the last published digit: 0.01 inch is 2.54e-4 m, 1 mm is 1e-3 m. */
  step: number;
}

function reading(text: string, unit: string, si: number): Reading | undefined {
  const match = new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*${unit}(?![a-z])`, 'i').exec(text);
  if (!match) return undefined;
  const printed = match[1]!.replace(',', '.');
  const number = Number(printed);
  if (!Number.isFinite(number)) return undefined;
  const decimals = printed.split('.')[1]?.length ?? 0;
  return { value: number * si, step: 10 ** -decimals * si };
}

/** Of the figures a sheet gives for one measure, the one printed to the finest step. */
function finest(readings: (Reading | undefined)[]): number | undefined {
  const known = readings.filter((entry): entry is Reading => entry !== undefined);
  if (known.length === 0) return undefined;
  return known.reduce((best, entry) => (entry.step < best.step ? entry : best)).value;
}

/** `71 mm`, `12.7 cm` or `2.80"` → metres, taking whichever the sheet printed to the finer step. */
export function length(value: string): number | undefined {
  const { imperial, metric } = renderings(value);
  return finest([
    reading(metric, 'mm', units.MILLIMETRE),
    reading(metric, 'cm', 1e-2),
    reading(imperial, '("|in\\b|inch)', units.INCH) ?? reading(value, '("|&quot;)', units.INCH),
  ]);
}

/** `317 g` or `1.2 kg` (metric, preferred), else `11.2 oz.` or `6 lbs. 2 oz.` → kilograms. */
export function mass(value: string): number | undefined {
  const { imperial, metric } = renderings(value);
  const pounds = reading(imperial, '(lbs?\\.?)', units.POUND);
  const ounces = reading(imperial, '(oz\\.?)', OUNCE);
  // `6 lbs. 2 oz.` is one figure in two words; its step is the step of the smaller word.
  const customary =
    pounds === undefined && ounces === undefined
      ? undefined
      : { value: (pounds?.value ?? 0) + (ounces?.value ?? 0), step: (ounces ?? pounds!).step };
  return finest([reading(metric, 'g', units.GRAM), reading(metric, 'kg', 1), customary]);
}

/** `1:16" RH` → 0.4064 m, the length of barrel per turn. Anything else, such as `Varies`, is nothing. */
export function twistLength(value: string): number | undefined {
  const match = /^1\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*("|&quot;|in)/i.exec(decode(plainText(value)).replace(/^\s+/, ''));
  if (!match) return undefined;
  return Number(match[1]) * units.INCH;
}

/**
 * A cartridge a reloader can load for: it has a figure in it, and is not a rimfire (.22 LR, .22 WMR,
 * .17 HMR, .22 Short), an air gun, a blank, or a training or marking round.
 */
export function loadable(caliber: string): boolean {
  return (
    /[0-9]/.test(caliber) &&
    !/training|marking|blank|air|pellet|bb\b|simunition/i.test(caliber) &&
    !/\b(22|17)\s*(lr|long rifle|wmr|win\.? mag|hmr|short|wsm|mach 2|hm2)\b/i.test(caliber) &&
    !/^\.?22\s*(mag|rimfire)/i.test(caliber)
  );
}

/**
 * The model from a sheet: its headline, without the trademark signs and without the maker's name
 * (some headlines say `Ruger Vaquero`, and the gun is named `Ruger ...` anyway), and the model number.
 */
export function modelFrom(page: string, modelNumber: string): string | undefined {
  const headline = /<h1>(.*?)<\/h1>/s.exec(page)?.[1];
  if (headline === undefined) return undefined;
  const family = plainText(headline.replace(/<sup>.*?<\/sup>/g, '')).replace(/\bRuger[\s-]+/gi, '').trim();
  return family === '' ? undefined : `${family} ${modelNumber}`;
}

/** The gun a sheet describes, or nothing when it is not one a reloader loads for. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | undefined {
  const items = specifications(page);
  const find = (title: string) => items.find((item) => item.title.toLowerCase() === title)?.value;
  const modelNumber = plainText(find('model number') ?? '');
  const caliber = plainText(find('caliber') ?? '');
  const model = modelNumber === '' ? undefined : modelFrom(page, modelNumber);
  const barrel = length(find('barrel length') ?? '');
  const gunMass = mass(find('weight') ?? '');
  const twist = twistLength(find('twist') ?? '');
  if (model === undefined || caliber === '' || !loadable(caliber) || barrel === undefined) return undefined;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: `Ruger ${model}`,
    maker: 'Ruger',
    model,
    cartridge: caliber,
    barrel: {
      name: `Ruger ${model}`,
      length: barrel,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: { kind: 'published', publisher: 'Sturm, Ruger & Co., Inc.', url, retrieved },
  };
}

/**
 * The product family pages and the specification sheets a page links to, as full addresses. A family's
 * models page links its sheets by relative address (`specSheets/5801.html`, sometimes with `?buy=1`).
 */
export function links(page: string, pageUrl: string): { families: string[]; sheets: string[] } {
  const hrefs = [...page.matchAll(/href="([^"]*)"/g)].map(([, href]) => decode(href!).replace(/[?#].*$/, ''));
  const absolute = (href: string) => new URL(href, pageUrl).href;
  const families = hrefs.filter((href) => /^\/products\/[A-Za-z0-9-]+\/(models|overview)\.html$/.test(href));
  const sheets = hrefs.filter((href) => /^(\/products\/[A-Za-z0-9-]+\/)?specSheets\/[0-9A-Za-z-]+\.html$/.test(href));
  return { families: families.map(absolute), sheets: sheets.map(absolute) };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** A file name from a gun's name: lower case, words joined by hyphens. */
function fileName(firearm: Firearm): string {
  return `${firearm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.firearm.json`;
}

/**
 * The addresses of the specification sheets, found from the home page through the family pages. A sheet
 * page is linked from its family's models page by a relative address, so the family it belongs to is
 * the page it was found on.
 */
async function findSheets(limit: number): Promise<string[]> {
  const home = await fetchText(`${SITE}/`);
  const queue = [...new Set(links(home, `${SITE}/`).families)];
  const seen = new Set(queue);
  const sheets = new Set<string>();
  for (let index = 0; index < queue.length && sheets.size < limit; index++) {
    const family = queue[index]!;
    await sleep(DELAY);
    let page: string;
    try {
      page = await fetchText(family);
    } catch (error) {
      console.log(` - ${family}: ${(error as Error).message}`);
      continue;
    }
    const found = links(page, family);
    for (const sheet of found.sheets) sheets.add(sheet);
    for (const next of found.families) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  console.log(`${queue.length} family pages, ${sheets.size} specification sheets`);
  return [...sheets].slice(0, limit);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const folder = args.find((argument) => !argument.startsWith('--'));
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Infinity;
  if (!folder) {
    console.error('usage: node tools/data/firearms/ruger.ts <output folder> [--limit 5]');
    process.exitCode = 1;
    return;
  }
  const sheets = await findSheets(limit);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const names = new Set<string>();
  for (const url of sheets) {
    await sleep(DELAY);
    let page: string;
    try {
      page = await fetchText(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const firearm = firearmFrom(page, url, retrieved);
    if (!firearm) {
      const caliber = plainText(specifications(page).find((item) => item.title.toLowerCase() === 'caliber')?.value ?? '');
      skipped.push(`${url}: ${caliber === '' ? 'no cartridge' : loadable(caliber) ? 'no barrel length' : `not loadable (${caliber})`}`);
      continue;
    }
    // Written through the format's own reader, so nothing invalid is ever produced.
    const text = serializeFirearm(firearm);
    const check = parseFirearm(text);
    if (!check.ok) {
      skipped.push(`${url}: ${check.issues.map((issue) => issue.message).join('; ')}`);
      continue;
    }
    const file = fileName(firearm);
    if (names.has(file)) {
      skipped.push(`${url}: ${firearm.name} is already written`);
      continue;
    }
    names.add(file);
    writeFileSync(join(folder, file), text);
    written++;
    console.log(
      `${firearm.name.padEnd(40)} ${firearm.cartridge?.padEnd(16)} ` +
        `${(firearm.barrel.length * 1000).toFixed(1)} mm` +
        `${firearm.barrel.twistLength === undefined ? '' : `  1:${(firearm.barrel.twistLength / units.INCH).toFixed(1)}"`}` +
        `${firearm.barrel.gunMass === undefined ? '' : `  ${(firearm.barrel.gunMass * 1000).toFixed(0)} g`}`,
    );
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
