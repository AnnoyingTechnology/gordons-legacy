/**
 * Reads Oberland Arms' published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/oberland-arms.ts <output folder> [--limit 5]
 *
 * oberlandarms.com is a Shopware shop. Its sitemap (a gzip file) lists every product; the rifles are
 * under `/waffen/`. A rifle's description holds a bilingual specification as labelled lines:
 *
 *     Kaliber / caliber:                         .223Rem./5,56x45mm
 *     Lauflänge / barrel lenght:                 20" / 51cm
 *     Gewicht mit leerem Magazin / weight:       3,7kg
 *
 * The weight is in that text, written by the maker for the gun. The shop's own `weight` field (a
 * shipping weight) is never read. The label says the mass is with an empty magazine, so that is the
 * basis; a weight that says `(ohne Magazin)` is `without-magazine`.
 *
 * Deliberately left out:
 * - the pistols under `/waffen/kurzwaffen/` (Glock work for the shop: the pages hold dimensions and no
 *   barrel or weight), not fetched at all;
 * - `Wechselsystem` pages: an upper receiver with its barrel, not a complete gun;
 * - training rifles for marking ammunition (`Trainingswaffe`, `FX`) and rimfire rifles;
 * - a page whose barrel in inches and in millimetres contradict each other (`16" / 40,64mm`), and a
 *   mass that is not a number (a page with text in the weight line).
 * - the twist: the premium series prints `Drall 1-7/ 1-8` in the series line, for two barrels at once,
 *   so no record carries one.
 *
 * The maker's cartridge forms are mapped in a table, one entry per form, and kept in
 * `source.published.caliber`: `.223Rem./5,56x45mm` is how they write a .223 Rem. chambering. A form not
 * in the table is kept as written.
 *
 * Where a title and its specification disagree (a title naming a 16.75 inch barrel above a
 * `16" / 40,65cm` line) the specification line is read: it is the figure with a unit.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadableCartridge } from './loadable-cartridge.ts';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
import { clashes, printedLength, printedMass } from './metric-figures.ts';
import { AGENT, crawlArguments, fetchPage, fileName, firearmJson, plainText, plausibleGunMass, summaryLine, textLines } from './maker-site.ts';
import { publishedFigures, type MassBasis } from './published-figures.ts';

const SITEMAP = 'https://www.oberlandarms.com/web/sitemap/shop-1/sitemap-1.xml.gz';
const SITE = 'https://www.oberlandarms.com';

/** The maker's forms of a cartridge and the name a reloader uses; every other form is kept as written. */
const CARTRIDGES: Record<string, string> = {
  '.223Rem./5,56x45mm': '.223 Rem.',
  '9mm Luger / 9x19mm': '9x19 mm',
  '.300BLK (Blackout)': '.300 AAC Blackout',
};

/**
 * The sitemap, which is a gzip file: the shared `fetchText` reads text, so this reads the bytes. The
 * runtime undoes a `Content-Encoding: gzip` by itself, so the bytes are decompressed only if they
 * still start with the gzip magic number.
 */
async function fetchGzipText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/**
 * The rifle pages of the shop's sitemap: under `/waffen/`, with the article number the shop puts in a
 * product's address (`/waffen/premium-series/345/...`), which a category page lacks; not the pistols
 * nor the upper receivers.
 */
export function rifleLinks(sitemap: string): string[] {
  const links = [...sitemap.matchAll(/<loc>\s*([^<\s]*)\s*<\/loc>/g)].map(([, url]) => url!);
  return [...new Set(links.filter((url) => url.startsWith(`${SITE}/waffen/`) && /\/[0-9]+\/[^/]+$/.test(url) && !/\/waffen\/kurzwaffen\//.test(url) && !/\/wechselsystem-/.test(url)))];
}

/** The headline of a product page. */
export function productTitle(page: string): string | undefined {
  const title = /<h1[^>]*class="product--title"[^>]*>(.*?)<\/h1>/s.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title);
}

/**
 * The labelled lines of the specification: each label (`Kaliber / caliber:`) with the line after it.
 * The labels are the maker's bilingual ones, so they are kept whole.
 */
export function specification(page: string): Map<string, string> {
  const lines = textLines(page);
  const start = lines.findIndex((line) => line.startsWith('Details / Ausstattung'));
  const found = new Map<string, string>();
  if (start < 0) return found;
  for (let index = start; index < lines.length - 1; index++) {
    const line = lines[index]!;
    if (line.startsWith('Lieferumfang')) break;
    if (line.endsWith(':') && !found.has(line)) found.set(line, lines[index + 1]!);
  }
  return found;
}

/** The value of the first line whose label starts with `label`. */
function labelled(details: Map<string, string>, label: string): { label: string; value: string } | undefined {
  for (const [key, value] of details) if (key.startsWith(label)) return { label: key, value };
  return undefined;
}

/** What a weight says it includes: the label's `mit leerem Magazin` or the value's `(ohne Magazin)`. */
export function massBasisOf(label: string, value: string): MassBasis {
  if (/ohne\s+Magazin/i.test(value)) return 'without-magazine';
  return /leerem\s+Magazin/i.test(label) ? 'empty-magazine' : 'unstated';
}

/** The gun of one product page, or the reason there is none. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | { skipped: string } {
  const title = productTitle(page);
  if (title === undefined) return { skipped: 'no product title' };
  const details = specification(page);
  const series = labelled(details, 'Artikel-Gruppe')?.value ?? '';
  if (/^Wechselsystem/i.test(title)) return { skipped: 'an upper receiver, not a complete gun' };
  if (/Trainingswaffe|Training Rifle|\bFX\b/i.test(`${title} ${series}`)) return { skipped: 'a training rifle for marking ammunition' };
  const caliber = labelled(details, 'Kaliber')?.value;
  const barrel = labelled(details, 'Lauflänge')?.value;
  if (caliber === undefined || barrel === undefined) return { skipped: 'no caliber or no barrel length in the specification' };
  const cartridge = CARTRIDGES[caliber] ?? caliber;
  if (!loadableCartridge(cartridge)) return { skipped: `${caliber} is not a cartridge to load for` };
  const length = printedLength(barrel);
  if (length === undefined) return { skipped: `no single barrel length in "${barrel}"` };
  const weight = labelled(details, 'Gewicht');
  const gunMass = weight === undefined ? undefined : plausibleGunMass(printedMass(weight.value));
  const name = `Oberland Arms ${title}`;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    maker: 'Oberland Arms',
    model: title,
    cartridge,
    barrel: {
      name,
      length,
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Oberland Arms GmbH',
      url,
      retrieved,
      ...(gunMass === undefined || weight === undefined ? {} : { massBasis: massBasisOf(weight.label, weight.value) }),
      published: publishedFigures({ barrelLength: barrel, weight: gunMass === undefined ? undefined : weight?.value, caliber }),
    },
  };
}

async function main(): Promise<void> {
  const args = crawlArguments('oberland-arms', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = rifleLinks(await fetchGzipText(SITEMAP)).slice(0, limit);
  console.log(`${pages.length} rifle pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const guns: Firearm[] = [];
  const skipped: string[] = [];
  for (const url of pages) {
    try {
      const result = firearmFrom(await fetchPage(url), url, retrieved);
      if ('skipped' in result) skipped.push(`${url}: ${result.skipped}`);
      else guns.push(result);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
    }
  }
  const taken = new Set<string>();
  for (const [name, same] of clashes(guns)) {
    skipped.push(`name clash, only the first is written: ${name} (${same.map((gun) => gun.source?.url).join(', ')})`);
  }
  for (const gun of guns) {
    if (taken.has(gun.name)) continue;
    const json = firearmJson(gun);
    if ('problem' in json) {
      skipped.push(`${gun.name}: ${json.problem}`);
      continue;
    }
    writeFileSync(join(folder, fileName(gun)), json.text);
    taken.add(gun.name);
    console.log(summaryLine(gun));
  }
  console.log(`\n${taken.size} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
