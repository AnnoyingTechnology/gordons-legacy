/**
 * Reads Steyr Arms' published rifle and pistol specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/steyr.ts <output folder> [--limit 5]
 *
 * steyr-arms.com is a WordPress site. Its English page sitemap lists the products; the pages under
 * `/en/hunting-rifles/`, `/en/sporting-rifles/` and `/en/pistols/` are read (the `military-law-enforcement`
 * copies repeat them). A page has a "Specifications" block with one tab per variant:
 *
 *     <div class='weapon-specifications-tab-name' data-tab='2'>STEYR MANNLICHER CL II Mountain</div>
 *     <div class='weapon-specifications-tab-options' data-tab='2'>
 *       <div class='option-item'><div class='option-name'>Barrel Length</div>
 *                                <div class='option-value'>508 mm / 20″</div></div> ...
 *
 * The tab number ties a variant's name to its figures, so no pairing is guessed by position. The caliber
 * is a list (`.223 Rem., .243 Win., .308 Win.`) sharing the tab's one barrel length and one weight: one
 * record is written per cartridge, each carrying the figures the tab prints for the whole list.
 *
 * Only a tab whose figures are plain is read. Deliberately left out:
 * - a tab with several barrel lengths, several weights, a starred or "from" figure (the Monobloc, MS Wild,
 *   RMS Wild, SSG 08, SSG M1A2, DMR, the AUG SA variants with `*` and `**`), because the page pairs them
 *   with cartridges in prose or by asterisk; those guns are reported as skipped, not guessed;
 * - rimfire (the Zephyr II) and anything without a barrel length (the Breezer and UMS suppressors);
 * - a twist unless the tab names one cartridge (the THB: `1 turn right in 7,9″`). It is kept under
 *   `twistRate`, the maker's own words, since the corpus checker only reads ratios.
 *
 * The mass basis is read from the weight's own words: `With empty magazine` is `empty-magazine`,
 * `without magazine(s)` is `without-magazine`, anything else `unstated`. The pound figure beside a
 * kilogram figure is a conversion and is not used.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadableCartridge } from './loadable-cartridge.ts';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
import { clashes, printedLength, printedMass, printedTwist, sitemapLocations } from './german-speaking-makers.ts';
import { crawlArguments, fetchPage, fetchText, fileName, firearmJson, plainText, plausibleGunMass, summaryLine } from './maker-site.ts';
import { publishedFigures, type MassBasis } from './published-figures.ts';

const SITEMAP = 'https://www.steyr-arms.com/en/page-sitemap.xml';

/** One tab of a page's specifications: a variant and its labelled figures. */
export interface Tab {
  /** `STEYR MANNLICHER CL II Mountain`. */
  name: string;
  /** Option name (`Barrel Length`) → value, as plain text. */
  options: Map<string, string>;
}

/** The product pages a sitemap lists: hunting rifles, sporting rifles and pistols, not the category pages. */
export function productPages(sitemap: string): string[] {
  const pages = sitemapLocations(sitemap).filter((url) => /\/en\/(hunting-rifles|sporting-rifles|pistols)\/[a-z0-9-]+\/$/.test(url));
  return [...new Set(pages)];
}

/** The tabs of a page that have a name and at least one figure, in tab order. */
export function tabs(page: string): Tab[] {
  const names = new Map<string, string>();
  for (const [, number, name] of page.matchAll(/class='weapon-specifications-tab-name[^']*' data-tab='(\d+)'>([^<]*)</g)) {
    if (plainText(name!) !== '') names.set(number!, plainText(name!));
  }
  const found: Tab[] = [];
  const parts = page.split(/<div class='weapon-specifications-tab-options[^']*' data-tab='/).slice(1);
  for (const part of parts) {
    const number = /^(\d+)'/.exec(part)?.[1];
    const name = number === undefined ? undefined : names.get(number);
    if (name === undefined) continue;
    const options = new Map<string, string>();
    for (const [, option, value] of part.matchAll(/<div class='option-name'>(.*?)<\/div><div class='option-value'>(.*?)<\/div>/gs)) {
      if (!options.has(plainText(option!))) options.set(plainText(option!), plainText(value!));
    }
    if (options.size > 0) found.push({ name, options });
  }
  return found;
}

/** The option whose name is one of `names`, compared without case. */
function option(tab: Tab, ...names: string[]): string | undefined {
  for (const [name, value] of tab.options) if (names.includes(name.toLowerCase())) return value;
  return undefined;
}

/**
 * The cartridges of a caliber line, or none when the line is not a plain list. A comma followed by a
 * space separates two cartridges (`6,5x55 SE, 8x57 JS`); a decimal comma is not followed by one. A
 * leading asterisk marks a cartridge the page treats differently, which a plain list cannot say.
 */
export function cartridgesOf(caliber: string): string[] {
  if (/[*]/.test(caliber)) return [];
  return caliber.split(/,\s+/).map((entry) => entry.trim().replace(/[,;]$/, '')).filter((entry) => entry !== '');
}

/** What a weight's own words say it includes. */
export function massBasisOf(weight: string): MassBasis {
  if (/empty\s+magazine/i.test(weight)) return 'empty-magazine';
  if (/without\s+magazine/i.test(weight)) return 'without-magazine';
  return 'unstated';
}

/** The guns of one tab: one per cartridge, or none with the reason. */
export function firearmsFrom(tab: Tab, url: string, retrieved: string): { guns: Firearm[]; skipped: string[] } {
  const skipped: string[] = [];
  const caliber = option(tab, 'caliber');
  const barrel = option(tab, 'barrel length');
  if (caliber === undefined || barrel === undefined) return { guns: [], skipped: [`${tab.name}: no caliber or no barrel length`] };
  const cartridges = cartridgesOf(caliber);
  if (cartridges.length === 0) return { guns: [], skipped: [`${tab.name}: no plain list of cartridges in "${caliber}"`] };
  const length = printedLength(barrel);
  if (length === undefined) return { guns: [], skipped: [`${tab.name}: no single barrel length in "${barrel}"`] };
  // The pistols print the magazine's own weight in the same cell (`Weight empty magazine: 89g`): not the gun's.
  const weight = option(tab, 'weight', 'total weight')?.split(/\bWeight empty magazine\b/i)[0]?.trim();
  const gunMass = weight === undefined || /^\s*from\b|[*]/i.test(weight) ? undefined : plausibleGunMass(printedMass(weight));
  const twistText = option(tab, 'twist rate', 'twist length', 'twist');
  const twist = cartridges.length === 1 && twistText !== undefined ? printedTwist(twistText) : undefined;
  const model = tab.name.replace(/^STEYR\s+/i, '');
  const guns: Firearm[] = [];
  for (const cartridge of cartridges) {
    if (!loadableCartridge(cartridge)) {
      skipped.push(`${tab.name}: ${cartridge} is not a cartridge to load for`);
      continue;
    }
    const name = `Steyr ${model} ${cartridge}`;
    guns.push({
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Steyr Arms',
      model,
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
        publisher: 'Steyr Arms GmbH',
        url,
        retrieved,
        ...(gunMass === undefined || weight === undefined ? {} : { massBasis: massBasisOf(weight) }),
        published: publishedFigures({ barrelLength: barrel, weight: gunMass === undefined ? undefined : weight, twist: twist === undefined ? undefined : twistText }),
      },
    });
  }
  return { guns, skipped };
}

async function main(): Promise<void> {
  const args = crawlArguments('steyr', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = productPages(await fetchText(SITEMAP)).slice(0, limit);
  console.log(`${pages.length} product pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const guns: Firearm[] = [];
  const skipped: string[] = [];
  for (const url of pages) {
    let page: string;
    try {
      page = await fetchPage(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const found = tabs(page);
    if (found.length === 0) skipped.push(`${url}: no specification tab`);
    for (const tab of found) {
      const result = firearmsFrom(tab, url, retrieved);
      guns.push(...result.guns);
      skipped.push(...result.skipped.map((reason) => `${url}: ${reason}`));
    }
  }
  for (const [name, same] of clashes(guns)) {
    skipped.push(`name clash, only the first is written: ${name} (${same.map((gun) => gun.source?.url).join(', ')})`);
  }
  const written = new Set<string>();
  for (const gun of guns) {
    if (written.has(gun.name)) continue;
    const json = firearmJson(gun);
    if ('problem' in json) {
      skipped.push(`${gun.name}: ${json.problem}`);
      continue;
    }
    writeFileSync(join(folder, fileName(gun)), json.text);
    written.add(gun.name);
    console.log(summaryLine(gun));
  }
  console.log(`\n${written.size} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
