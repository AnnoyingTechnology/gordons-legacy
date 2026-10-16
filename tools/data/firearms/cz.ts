/**
 * Reads CZ's published rifle and pistol specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/cz.ts <output folder> [--limit 5]
 *
 * czfirearms.com (czub.cz and cz-usa.com both lead there) is a Next.js site. Its specifications are not
 * in the visible markup but in the page's own data, which the server sends inside the HTML as
 * `self.__next_f.push([1,"..."])` script chunks: one record per variant (one per cartridge), each with
 * a list of attributes that carry a metric value, an imperial value and a unit.
 *
 * Only the German pages are read. The sitemap lists English (`/en-us/...`) addresses, but those
 * redirect to an address without a language that answers 404 for pistols; the German pages answer 200
 * for every product and carry the same figures. The attribute keys are German (`lauflange`, ...).
 *
 * Only the cartridge, the barrel length, the twist and the mass are taken. Nothing else.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.czfirearms.com/sitemap.xml';
/** Centerfire categories of the German pages; shotguns and rimfire rifles are left out. */
const CATEGORIES = ['pistolen', 'zentralfeuerbuchsen', 'selbstladebuchsen'];

/** One attribute of a variant, as the page's data gives it. */
export interface Attribute {
  /** The attribute's key, for example `lauflange` (barrel length). */
  key: string;
  /** Free text, for an attribute that is a word or a ratio (cartridge, twist). */
  text?: string;
  /** The metric value, as written (`610`). */
  metric?: string;
  /** The unit of the metric value (`mm`, `g`, `kg`). */
  unit?: string;
}

/** One cartridge of a product: `CZ 600+ ALPHA 308 Win.`. */
export interface Variant {
  title: string;
  attributes: Attribute[];
}

/** The data chunks the server embeds in the page, joined and decoded. */
export function pageData(page: string): string {
  let data = '';
  for (const match of page.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) data += JSON.parse(match[1]!) as string;
  return data;
}

const JSON_STRING_OR_NULL = '(null|"(?:[^"\\\\]|\\\\.)*")';
const ATTRIBUTE = new RegExp(
  `\\{"value":${JSON_STRING_OR_NULL},"enumValue":${JSON_STRING_OR_NULL},"valueMetric":${JSON_STRING_OR_NULL},` +
    `"valueImperial":${JSON_STRING_OR_NULL},"productAttribute":\\{[^}]*?"key":"([^"]*)"[^}]*?"metricUnit":${JSON_STRING_OR_NULL}`,
  'g',
);

function jsonText(literal: string | undefined): string | undefined {
  return literal === undefined || literal === 'null' ? undefined : (JSON.parse(literal) as string);
}

/**
 * The variants of the product a page is about. The data lists them again further down (and lists the
 * related products' too), so reading stops at the first title seen twice.
 */
export function variantsOf(page: string): Variant[] {
  const data = pageData(page);
  const starts = [...data.matchAll(/\{"title":"([^"]*)","productAttributes":\[/g)];
  const variants: Variant[] = [];
  const seen = new Set<string>();
  for (const [index, start] of starts.entries()) {
    const title = start[1]!.trim();
    if (seen.has(title)) break;
    seen.add(title);
    const body = data.slice(start.index, starts[index + 1]?.index ?? start.index + 8000);
    const attributes: Attribute[] = [];
    for (const match of body.matchAll(ATTRIBUTE)) {
      const text = jsonText(match[2]);
      const metric = jsonText(match[3]);
      const unit = jsonText(match[6]);
      attributes.push({
        key: match[5]!,
        ...(text === undefined ? {} : { text }),
        ...(metric === undefined ? {} : { metric }),
        ...(unit === undefined ? {} : { unit }),
      });
    }
    variants.push({ title, attributes });
  }
  return variants;
}

/** A length or a mass in SI units from a metric attribute (`114` mm, `3.45` kg, `1170` g), or nothing. */
export function metricValue(attribute: Attribute | undefined): number | undefined {
  if (attribute?.metric === undefined || !/^[0-9]+(?:[.,][0-9]+)?$/.test(attribute.metric.trim())) return undefined;
  const number = Number(attribute.metric.trim().replace(',', '.'));
  switch (attribute.unit) {
    case 'mm':
      return number * units.MILLIMETRE;
    case 'g':
      return number * units.GRAM;
    case 'kg':
      return number;
    default:
      return undefined;
  }
}

/** An attribute as CZ prints it: its figure and unit, or the words where it gives no figure. */
export function attributeText(attribute: Attribute | undefined): string | undefined {
  if (!attribute) return undefined;
  if (attribute.metric !== undefined && attribute.unit !== undefined) return `${attribute.metric} ${attribute.unit}`;
  return attribute.text ?? attribute.metric;
}

/**
 * The twist in metres per turn from `1 : 7 / 6` (one turn in 7 units; the 6 is the number of grooves).
 * CZ writes inches; a number of 100 or more can only be millimetres. In between is unknown: nothing.
 */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^\s*1\s*:\s*([0-9]+(?:[.,][0-9]+)?)/.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  if (number > 0 && number < 50) return number * units.INCH;
  if (number >= 100) return number * units.MILLIMETRE;
  return undefined;
}

/** A cartridge a reloader loads for: it has a figure in it, and it is no rimfire. */
export function loadable(caliber: string): boolean {
  return /[0-9]/.test(caliber) && !/flobert/i.test(caliber) && !/\b(22|17)\s*(lr|long rifle|wmr|hmr|short)\b/i.test(caliber);
}

/** The gun a variant describes, or nothing when it lacks a cartridge or a barrel length. */
export function firearmFrom(variant: Variant, url: string, retrieved: string): Firearm | undefined {
  const find = (key: string) => variant.attributes.find((attribute) => attribute.key === key);
  // Their data writes `9 × 19`; a record carries the spelling a cartridge is compared by (maker-site.ts).
  const cartridgeText = find('kaliber')?.text;
  const cartridge = cartridgeText === undefined ? undefined : plainText(cartridgeText);
  const length = metricValue(find('lauflange'));
  // A pistol is weighed with its empty magazine: the gun as it recoils. Their rifles give one weight
  // and do not say what it covers, so the record says `unstated` instead of claiming that basis.
  const emptyMagazine = find('gewicht-mit-leerem-magazin');
  const weight = metricValue(emptyMagazine) === undefined ? find('gewicht') : emptyMagazine;
  const mass = plausibleGunMass(metricValue(weight));
  const twistText = find('dralllange-anzahl-der-zuge')?.text;
  const twist = twistLength(twistText);
  if (!cartridge || !loadable(cartridge) || length === undefined) return undefined;
  const name = plainText(variant.title);
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    maker: 'CZ',
    model: name.replace(/^CZ\s*/i, ''),
    cartridge,
    barrel: {
      name,
      length,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(mass === undefined ? {} : { gunMass: mass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Česká zbrojovka a.s.',
      url,
      retrieved,
      ...(mass === undefined ? {} : { massBasis: weight === emptyMagazine ? 'empty-magazine' : 'unstated' }),
      published: publishedFigures({ barrelLength: attributeText(find('lauflange')), weight: attributeText(weight), twist: twistText }),
    },
  };
}

async function main(): Promise<void> {
  const args = crawlArguments('cz', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, url]) => url!)
    .filter((url) => CATEGORIES.some((category) => url.includes(`/de/produkte/${category}/`)))
    .slice(0, limit);
  console.log(`${pages.length} product pages`);
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
    for (const variant of variantsOf(page)) {
      const firearm = firearmFrom(variant, url, retrieved);
      if (!firearm) {
        skipped.push(`${url}: ${variant.title}: no cartridge or no barrel length`);
        continue;
      }
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${json.problem}`);
        continue;
      }
      const file = fileName(firearm);
      if (names.has(file)) continue; // a series page lists what the product pages list too
      names.add(file);
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
