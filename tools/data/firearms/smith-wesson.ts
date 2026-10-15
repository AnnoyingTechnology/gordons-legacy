/**
 * Reads Smith & Wesson's published firearm specifications into gun files (issue #30). Maintainer tool,
 * written like glock.ts.
 *
 *     node tools/data/firearms/smith-wesson.ts <output folder> [--limit 5]
 *
 * It takes the product pages the maker's own sitemap lists, waits a second between them, and keeps only
 * the figures the simulation needs: the cartridge, the barrel length, the mass of the gun, and the
 * twist rate when one is given. Nothing else is taken — no prose, no picture, no price — and every file
 * records the page its figures come from, so a user can check them.
 *
 * What the pages give:
 *  - The page carries its data as JSON in a `__NEXT_DATA__` script. The specification list sits in
 *    `customfields.array.data` as `{ name, value }` pairs: `CALIBER`, `BARREL LENGTH`, `ACTION`...
 *    The values have no unit. `BARREL LENGTH` is in inches: the same page's description says
 *    `4.22” ... barrel` for `"4.22"`, and the maker is American. A number outside what a barrel can be
 *    in inches is not guessed at: the gun is skipped.
 *  - The mass is the `WEIGHT 29 oz` line of `customfields.object.customDimensions`, whose unit is
 *    written. It is the maker's weight of the gun, magazine included or not, they do not say; the
 *    figure is nominal like the barrel length.
 *  - The twist is not a field. It is written in the description as `1:10” twist`, with its unit; it is
 *    read only from the product's own description, never from the related products listed on the page.
 *  - A revolver's published barrel length is measured from the cylinder face, so the simulation's barrel
 *    length for one (from the chamber mouth, with the cylinder gap in between) is not the published
 *    figure. No correction is made here: the files say `published`, and the application shows that.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, parseFirearm, serializeFirearm, units, type Firearm } from '@gordons-legacy/formats';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.smith-wesson.com/sitemap.xml';
const AGENT = 'gordons-legacy-research/1.0 (+https://github.com/AnnoyingTechnology/gordons-legacy)';
/** A second between pages: their robots.txt allows everything, which is no reason to be rude. */
const DELAY = 1000;

/** One avoirdupois ounce, kg: a sixteenth of the pound, exact by definition. */
const OUNCE = units.POUND / 16;

/** Rounds a conversion to the micro-unit, so that `9.8 oz` is saved as 0.277825 kg and not 0.27782532662500004. */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** A barrel shorter or longer than this, in inches, is not a barrel length written in inches. */
const BARREL_LENGTH_RANGE_INCHES = { shortest: 1, longest: 40 };

/** The data a product page carries, narrowed to what is read here. */
interface ProductPage {
  /** The product's name as the page gives it, for example `M&P®9 M2.0® OPTIC READY 15RD`. */
  name: string;
  /** The product's description, HTML. Prose: only a twist rate is read from it. */
  description: string;
  /** The specification list, `{ name, value }` pairs, values without unit. */
  specifications: Map<string, string>;
  /** The line of dimensions, HTML: `WEIGHT 29 oz WIDTH 1.16 in`. */
  dimensions: string;
}

/** The product a page describes, from the JSON the page embeds; nothing when the page has none. */
export function productPage(page: string): ProductPage | undefined {
  const json = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(page)?.[1];
  if (json === undefined) return undefined;
  let properties: PageProperties;
  try {
    properties = (JSON.parse(json) as { props?: { pageProps?: PageProperties } }).props?.pageProps ?? {};
  } catch {
    return undefined;
  }
  const name = properties.data?.name;
  if (typeof name !== 'string') return undefined;
  const specifications = new Map<string, string>();
  for (const { name: title, value } of properties.customfields?.array?.data ?? []) {
    if (typeof title === 'string' && typeof value === 'string') specifications.set(title.toUpperCase(), value.trim());
  }
  return {
    name: decode(name),
    description: properties.data?.description ?? '',
    specifications,
    dimensions: properties.customfields?.object?.customDimensions ?? '',
  };
}

/** The parts of the page's JSON that are read. */
interface PageProperties {
  data?: { name?: string; description?: string };
  customfields?: {
    array?: { data?: { name?: unknown; value?: unknown }[] };
    object?: { customDimensions?: string };
  };
}

/** Text out of the page's HTML: tags dropped, entities read, spaces collapsed. */
export function plainText(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decode(text: string): string {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&rdquo;', '”')
    .replaceAll('&ldquo;', '“')
    .replaceAll('&reg;', '®')
    .replaceAll('&trade;', '™')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/**
 * `4.22` → metres. The page gives inches without writing the unit (see the header of this file), though
 * a few write `5 in`; any other unit, and any other text, leaves the length out.
 */
export function barrelLength(value: string | undefined): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(?:in(?:ch(?:es)?)?|”|")?$/i.exec(value ?? '');
  if (!match) return undefined;
  const inches = Number(match[1]);
  if (inches < BARREL_LENGTH_RANGE_INCHES.shortest || inches > BARREL_LENGTH_RANGE_INCHES.longest) return undefined;
  return tidy(inches * units.INCH);
}

/** `WEIGHT 29 oz WIDTH 1.16 in` → kilograms. The unit is written; a weight without one is not read. */
export function gunMass(dimensions: string): number | undefined {
  const match = /\bWEIGHT\s*([0-9]+(?:\.[0-9]+)?)\s*(oz|lbs?)\b/i.exec(plainText(dimensions));
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!(number > 0)) return undefined;
  return tidy(number * (match[2]!.toLowerCase() === 'oz' ? OUNCE : units.POUND));
}

/**
 * The twist as the description writes it, and its figure: `4.22” 1:10” twist stainless steel barrel` →
 * `1:10” twist` and 10 inches per turn. Only a `1:10` tied to the word `twist` or `rifling` is read, so
 * that no other ratio on the page is mistaken for one, and the figure is read as inches — the unit this
 * maker writes everywhere, and the one its own `1:10”` carries where it bothers to mark it.
 */
function twistReading(description: string): { text: string; inchesPerTurn: number } | undefined {
  const text = plainText(description);
  const match =
    /\b1\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(?:”|"|-?\s*in(?:ch(?:es)?)?\b)?\s*(?:twist|rifling)/i.exec(text) ??
    /\btwist(?: rate)?(?: of)?\s*(?:is\s*)?1\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(”|"|in(?:ch(?:es)?)?\b)/i.exec(text);
  if (!match) return undefined;
  const inchesPerTurn = Number(match[1]);
  // A twist is a few inches to a few tens of inches per turn; anything else is another number.
  if (!(inchesPerTurn >= 3 && inchesPerTurn <= 40)) return undefined;
  return { text: match[0].replace(/\s+/g, ' ').trim(), inchesPerTurn };
}

/** `4.22” 1:10” twist stainless steel barrel` → 0.254 m, the length of barrel per full turn. */
export function twistLength(description: string): number | undefined {
  const reading = twistReading(description);
  return reading === undefined ? undefined : tidy(reading.inchesPerTurn * units.INCH);
}

/**
 * Whether a cartridge is one a reloader can load for: a name with a number in it, and not a rimfire.
 * The pages write calibers like `9MM`, `380 AUTO`, `44 MAGNUM`, `5.56 NATO`, `22 LR`, `22 MAGNUM`.
 */
export function loadable(caliber: string): boolean {
  if (!/[0-9]/.test(caliber)) return false;
  if (/\b(22|17)\s*(lr|long rifle|wmr|wmrf|hmr|short|magnum rimfire|win mag)\b/i.test(caliber)) return false;
  if (/\b22\s*magnum\b/i.test(caliber)) return false;
  if (/rimfire|blank|training|marking|airgun|air gun|bb\b|pellet|\bcal\b/i.test(caliber)) return false;
  // A shotgun fires shot, not the one projectile the simulation models.
  if (/gauge|\bga\b/i.test(caliber)) return false;
  // `410,45 COLT,45 Auto` is a gun that takes several cartridges: which one the figures are for is not said.
  if (caliber.includes(',')) return false;
  return true;
}

/**
 * Whether the product is a whole gun and not a part or a set. A gun has an action and a magazine
 * capacity in its specification; an upper, a slide kit or a barrel has neither. Bundles and combos sell
 * a gun with other things, and their weight is the whole parcel's: they are left out too.
 */
export function completeGun(page: ProductPage): boolean {
  const { specifications } = page;
  if (!specifications.has('ACTION') || !specifications.has('CAPACITY')) return false;
  return !/\b(upper|slide|frame|conversion|kit|bundle|combo|parts?|magazine|holster|case|bag)s?\b/i.test(page.name);
}

/** Capitals that stay capitals in a name: finishes, sights, series, cartridges, roman numerals. */
const ABBREVIATIONS = new Set(['FDE', 'ODG', 'PVD', 'NTS', 'NATO', 'BLK', 'ACP', 'III', 'LE']);

/**
 * The name for the application's list: the page's own name, with its trademark signs, its
 * `[DISCONTINUED]` tag and the maker's initials dropped, and a name set wholly in capitals set in lower
 * case, except abbreviations and words with a digit in them (`M2.0`, `15RD`).
 */
export function readableName(name: string): string {
  const plain = name
    .replace(/\[DISCONTINUED\]/gi, '')
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^S&W\s+/i, '');
  if (/[a-z]/.test(plain)) return plain;
  return plain
    .split(' ')
    .map((word) => (/^[A-Z]{3,}$/.test(word) && !ABBREVIATIONS.has(word) ? word[0] + word.slice(1).toLowerCase() : word))
    .join(' ');
}

/**
 * The conventional name of the cartridges the pages write in capitals and without punctuation. The
 * application puts the guns chambered for a load's cartridge first by comparing names, and `9MM` alone
 * would match too much. A caliber not in the table is kept as the page writes it.
 */
const CARTRIDGE_NAMES: Record<string, string> = {
  '9MM': '9x19 mm',
  '380 AUTO': '.380 Auto',
  '10MM': '10mm Auto',
  '40 S&W': '.40 S&W',
  '45 ACP': '.45 Auto',
  '45 AUTO': '.45 Auto',
  '5.7X28MM': '5.7x28 mm',
  '38 S&W SPECIAL': '.38 Special',
  '357 MAGNUM': '.357 Magnum',
  '44 MAGNUM': '.44 Magnum',
  '5.56 NATO': '5.56x45 mm NATO',
  '300 BLK': '.300 AAC Blackout',
  '6MM ARC': '6mm ARC',
  '30-30 WIN': '.30-30 Winchester',
  '308 WIN': '.308 Winchester',
  '30 SUPER CARRY': '.30 Super Carry',
  '32 H&R MAGNUM': '.32 H&R Magnum',
  '350 LEGEND': '.350 Legend',
  '360 BUCKHAMMER®': '.360 Buckhammer',
  '41 MAGNUM': '.41 Magnum',
  '44 SPECIAL': '.44 Special',
  '45 COLT': '.45 Colt',
  '460 S&W MAGNUM': '.460 S&W Magnum',
  '500 S&W MAGNUM': '.500 S&W Magnum',
  '6.5 CREEDMOOR': '6.5 Creedmoor',
  '45-70 GOVT': '.45-70 Government',
};

/** The gun a page describes, or nothing when it is not a complete gun a reloader loads for. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | undefined {
  const product = productPage(page);
  if (product === undefined || !completeGun(product)) return undefined;
  const caliber = product.specifications.get('CALIBER');
  const length = barrelLength(product.specifications.get('BARREL LENGTH'));
  if (!caliber || !loadable(caliber) || length === undefined) return undefined;
  const mass = gunMass(product.dimensions);
  const twistFound = twistReading(product.description);
  const twist = twistFound === undefined ? undefined : tidy(twistFound.inchesPerTurn * units.INCH);
  // Their pages print one weight and do not say what it includes, and their calibers are written in
  // capitals without punctuation: the record keeps both as published beside the names it uses.
  const weight = /\bWEIGHT\s*([0-9.]+\s*(?:oz|lbs?))\b/i.exec(plainText(product.dimensions))?.[1];
  const name = readableName(product.name);
  const model = product.specifications.get('MODEL');
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: `Smith & Wesson ${name}`,
    maker: 'Smith & Wesson',
    ...(model ? { model: decode(model) } : {}),
    cartridge: CARTRIDGE_NAMES[caliber.toUpperCase()] ?? readableName(caliber),
    barrel: {
      name: `Smith & Wesson ${name}`,
      length,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(mass === undefined ? {} : { gunMass: mass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Smith & Wesson Brands, Inc.',
      url,
      retrieved,
      ...(mass === undefined ? {} : { massBasis: 'unstated' as const }),
      published: publishedFigures({
        caliber,
        barrelLength: product.specifications.get('BARREL LENGTH'),
        weight,
        twist: twistFound?.text,
      }),
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The addresses a sitemap lists; a sitemap index lists sitemaps, which are read in turn. */
async function sitemapAddresses(url: string): Promise<string[]> {
  const addresses = [...(await fetchText(url)).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, address]) => address!);
  if (!addresses.every((address) => address.endsWith('.xml'))) return addresses;
  const lists: string[][] = [];
  for (const address of addresses) {
    await sleep(DELAY);
    lists.push(await sitemapAddresses(address));
  }
  return lists.flat();
}

/** Whether two pages give the same figures, which makes the second a duplicate. */
function sameFigures(a: Firearm, b: Firearm): boolean {
  return a.cartridge === b.cartridge && a.barrel.length === b.barrel.length && a.barrel.gunMass === b.barrel.gunMass;
}

/** A file name from a gun's name: lower case, words joined by hyphens. */
function fileName(firearm: Firearm): string {
  return `${firearm.name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.firearm.json`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const folder = args.find((argument) => !argument.startsWith('--'));
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Infinity;
  if (!folder) {
    console.error('usage: node tools/data/firearms/smith-wesson.ts <output folder> [--limit 5]');
    process.exitCode = 1;
    return;
  }
  const products = (await sitemapAddresses(SITEMAP)).filter((url) => /\/product\/[a-z0-9.-]+$/.test(url)).slice(0, limit);
  console.log(`${products.length} product pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const writtenFiles = new Map<string, Firearm>();
  for (const url of products) {
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
      skipped.push(`${url}: not a complete gun with a loadable cartridge and a barrel length`);
      continue;
    }
    // Written through the format's own reader, so nothing invalid is ever produced.
    const text = serializeFirearm(firearm);
    const check = parseFirearm(text);
    if (!check.ok) {
      skipped.push(`${url}: ${check.issues.map((issue) => issue.message).join('; ')}`);
      continue;
    }
    // Two pages sometimes give one name: the same gun listed twice, or one model in two cartridges.
    let file = fileName(firearm);
    const taken = writtenFiles.get(file);
    if (taken !== undefined) {
      if (sameFigures(taken, firearm)) {
        skipped.push(`${url}: ${firearm.name} is already written`);
        continue;
      }
      firearm.name = `${firearm.name} ${firearm.cartridge}`;
      firearm.barrel.name = firearm.name;
      file = fileName(firearm);
      if (writtenFiles.has(file)) {
        skipped.push(`${url}: ${firearm.name} is already written`);
        continue;
      }
    }
    writtenFiles.set(file, firearm);
    writeFileSync(join(folder, file), text);
    written++;
    console.log(
      `${firearm.name.padEnd(56)} ${firearm.cartridge?.padEnd(14)} ` +
        `${(firearm.barrel.length * 1000).toFixed(1)} mm` +
        `${firearm.barrel.gunMass === undefined ? '' : `  ${(firearm.barrel.gunMass * 1000).toFixed(0)} g`}` +
        `${firearm.barrel.twistLength === undefined ? '' : `  1:${(firearm.barrel.twistLength / units.INCH).toFixed(2)} in`}`,
    );
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
