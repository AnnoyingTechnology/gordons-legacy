/**
 * Reads C.G. Haenel's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/haenel.ts <output folder> [--limit 5]
 *
 * cg-haenel.de is a WordPress site (Avada). A model page under `/produkte/` holds one block per variant
 * (`<div id="JAEGERNXTTRACKER" class="hnl-product-details">`): a title (`JAEGER NXT <span>TRACKER</span>`),
 * badges telling who the variant is for (`bg-color-jagd` hunting, `bg-color-sport`, `bg-color-defence`),
 * and a "Technische Details" table of label and value cells, in German. The sitemap lists the pages.
 *
 * The figures come in three shapes, and each is read only where its meaning is plain:
 *
 * - bolt rifles: `Kaliber (Drall)` = `.308 Win. (12,0") / 8x57 IS (9,4")`, one twist per cartridge; one
 *   `Lauflänge` (`520 mm (Standard) / 610 mm (Magnum)`); one `Gewicht` (`ca. 3,1 kg`) for the variant.
 *   A cartridge that is a magnum (`.300 Win. Mag.`, the only one on these pages) takes the Magnum
 *   barrel, every other takes the Standard one; with a single barrel everything takes it. A cartridge
 *   with no barrel of its own is left out, not given another's.
 * - self-loaders: `Kaliber` and `Lauflänge, Drall` = `16,65": 423mm, 12"`, one entry per barrel length,
 *   and a `Gewicht` per barrel length (`16,65": ca. 3,6 kg`) or one for all. One gun per barrel length.
 * - precision rifles: `Kaliber`, `Drall`, `Lauflänge` and `Gewicht` as single lines.
 *
 * One record is written per cartridge (and per barrel length where there are several), so a page naming
 * six cartridges gives six guns, each with the barrel and the twist the page prints for that cartridge.
 *
 * Deliberately left out:
 * - variants only for authorities (the badge `defence` alone: the MK 556) and entries marked `nur für
 *   Behörden erhältlich`;
 * - training and marking rifles (`Farbmunition`, no cartridge at all);
 * - a weight given as a range (`ca. 4,3kg – 4,6kg` for four barrel lengths of the CR308): the mass is
 *   left out of those records, not averaged;
 * - a twist where one line gives several cartridges' twists in prose (the RS8): left out of the record.
 *
 * The mass is `unstated`: `ca. 5 kg (ohne Anbauteile)` says what is not on it (accessories), not what
 * it includes. The RS8 Subsonic's `ca. 7,65 kg (inkl. Schalldämpfer)` is the rifle with the suppressor
 * that is part of it, which is the gun the user holds and the mass that recoils; the record carries it
 * with the maker's words beside it, so that what the figure covers is on the screen. `Drall` is the maker's German word for the twist; the record keeps their string as
 * printed (a bare `12"`, which the corpus checker reads as one turn in twelve inches) under the shared
 * key `twist`, since a key no checker looks for is a figure nobody checks.
 *
 * The pages of the NXT repeat each other's variants (`/jaeger-nxt/` and `/jaeger-nxt-composite/` hold
 * the same seven blocks): a name seen twice with the same figures is kept once, one with different
 * figures is reported.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadableCartridge } from './loadable-cartridge.ts';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
import { printedLength, printedMass, printedTwist, sitemapLocations } from './german-speaking-makers.ts';
import { crawlArguments, fetchPage, fetchText, fileName, firearmJson, plainText, plausibleGunMass, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.cg-haenel.de/page-sitemap.xml';

/** The cartridges that take the Magnum barrel where a page offers a Standard and a Magnum one. */
const MAGNUM_CARTRIDGES = ['.300 Win. Mag.'];

/** Who a variant is for, from its badges. */
export type Audience = 'jagd' | 'sport' | 'defence';

/** One variant block of a model page. */
export interface Variant {
  /** `JAEGER NXT TRACKER`: the title with its second line. */
  title: string;
  audiences: Audience[];
  /** The technical table: label → value, as plain text. */
  details: Map<string, string>;
}

/** The product pages (`/produkte/<model>/`) a sitemap lists. */
export function productPages(sitemap: string): string[] {
  return [...new Set(sitemapLocations(sitemap).filter((url) => /\/produkte\/[a-z0-9-]+\/$/.test(url)))];
}

/** The variant blocks of a page, in order. A page with none (an accessory) gives an empty list. */
export function variants(page: string): Variant[] {
  const blocks = page.split(/<div id="[^"]*" class="hnl-product-details">/).slice(1);
  const found: Variant[] = [];
  for (const block of blocks) {
    const title = /<h2[^>]*>(.*?)<\/h2>/s.exec(block)?.[1];
    if (title === undefined) continue;
    const audiences = [...block.matchAll(/hnl-product-details-title-badge bg-color-(jagd|sport|defence)/g)].map(([, audience]) => audience as Audience);
    const details = new Map<string, string>();
    for (const [, row] of block.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
      const cells = [...row!.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(([, cell]) => plainText(cell!));
      if (cells.length === 2 && cells[0] !== '' && !details.has(cells[0]!)) details.set(cells[0]!, cells[1]!);
    }
    if (details.size > 0) found.push({ title: plainText(title), audiences, details });
  }
  return found;
}

/** An entry of a list the page separates with a slash: `a / b / c`, each trimmed. */
function entries(text: string): string[] {
  return text.split(/\s+\/\s+/).map((entry) => entry.trim()).filter((entry) => entry !== '');
}

/** An entry only for authorities. */
function forAuthoritiesOnly(entry: string): boolean {
  return /nur\s+für\s+Behörden/i.test(entry);
}

/**
 * The cartridge a `Kaliber` entry means, in the name a reloader uses: `7,62 x 51 mm (Zivil: .308 Win.)`
 * is `.308 Win.`, `7,62 x 51 mm (.308 Win.)` too, and `6,5 Creedmoor` stays as it is.
 */
export function cartridgeName(text: string): string {
  const named = /\((?:Zivil:\s*)?(\.[^()]+)\)/.exec(text)?.[1];
  return (named ?? text).trim();
}

/** A cartridge with the twist the page prints beside it. */
export interface CartridgeEntry {
  cartridge: string;
  /** The twist as printed (`11,0"`), when the entry carries one. */
  twist?: string;
}

/**
 * The cartridges of a variant. `Kaliber (Drall)` carries a twist per cartridge (`.308 Win. (12,0")`);
 * `Kaliber` alone does not, and then a plain `Drall` line gives the twist of the only cartridge.
 */
export function cartridgesOf(details: Map<string, string>): CartridgeEntry[] {
  const withTwist = details.get('Kaliber (Drall)');
  if (withTwist !== undefined) {
    return entries(withTwist).flatMap((entry) => {
      const match = /^(.*?)\s*\(([^()]*")\)$/.exec(entry);
      return match ? [{ cartridge: cartridgeName(match[1]!), twist: match[2]! }] : [{ cartridge: cartridgeName(entry) }];
    });
  }
  const caliber = details.get('Kaliber');
  if (caliber === undefined) return [];
  const list = entries(caliber).filter((entry) => !forAuthoritiesOnly(entry));
  const drall = details.get('Drall');
  const single = list.length === 1 && drall !== undefined && printedTwist(drall) !== undefined;
  return list.map((entry) => ({ cartridge: cartridgeName(entry), ...(single ? { twist: drall } : {}) }));
}

/** One barrel a variant offers, with the figures the page prints for it. */
export interface BarrelEntry {
  /** Which barrel: `Standard`, `Magnum`, or the length in inches the page names it by (`16,65`). */
  label?: string;
  /** The barrel as printed: `520 mm (Standard)` or `16,65": 423mm`. */
  length: string;
  /** A twist printed with the barrel (`12"` in `16,65": 423mm, 12"`). */
  twist?: string;
}

/**
 * The barrels of a variant: from `Lauflänge` (`520 mm (Standard) / 610 mm (Magnum)`, `600 mm`) or from
 * `Lauflänge, Drall` (`10,5": 267mm, 7" / 12,5": 318mm, 9"`). Entries for authorities are dropped.
 */
export function barrelsOf(details: Map<string, string>): BarrelEntry[] {
  const withTwist = details.get('Lauflänge, Drall');
  if (withTwist !== undefined) {
    return entries(withTwist).flatMap((entry) => {
      if (forAuthoritiesOnly(entry)) return [];
      const match = /^([0-9]+(?:[.,][0-9]+)?)"\s*:\s*([0-9]+(?:[.,][0-9]+)?\s*mm),\s*([0-9]+(?:[.,][0-9]+)?")/.exec(entry);
      return match ? [{ label: match[1]!, length: `${match[1]}": ${match[2]}`, twist: match[3]! }] : [];
    });
  }
  const plain = details.get('Lauflänge');
  if (plain === undefined) return [];
  return entries(plain).flatMap((entry) => {
    if (forAuthoritiesOnly(entry)) return [];
    const label = /\((Standard|Magnum)\)/.exec(entry)?.[1];
    return [{ ...(label === undefined ? {} : { label }), length: entry }];
  });
}

/** The barrel a cartridge takes, or undefined when the page offers it none of its own. */
export function barrelFor(cartridge: string, barrels: BarrelEntry[]): BarrelEntry | undefined {
  const named = barrels.some((barrel) => barrel.label === 'Standard') && barrels.some((barrel) => barrel.label === 'Magnum');
  if (named) return barrels.find((barrel) => barrel.label === (MAGNUM_CARTRIDGES.includes(cartridge) ? 'Magnum' : 'Standard'));
  if (barrels.length !== 1) return undefined;
  const only = barrels[0]!;
  return only.label === 'Standard' && MAGNUM_CARTRIDGES.includes(cartridge) ? undefined : only;
}

/**
 * The weight text that goes with a barrel. One `Gewicht` for the variant serves every barrel; a
 * `Gewicht` listing a weight per barrel length (`10,5": ca. 3,35 kg / 12,5": ca. 3,4 kg`) is matched on
 * the length it names; a range, or a list with no entry for this barrel, gives none.
 */
export function weightFor(details: Map<string, string>, barrel: BarrelEntry): string | undefined {
  const weight = details.get('Gewicht');
  if (weight === undefined) return undefined;
  const perBarrel = entries(weight);
  if (perBarrel.every((entry) => /^[0-9]+(?:[.,][0-9]+)?"\s*:/.test(entry))) {
    return perBarrel.find((entry) => entry.startsWith(`${barrel.label}"`));
  }
  return perBarrel.length === 1 ? weight : undefined;
}

/** The guns of one variant: one per cartridge, and per barrel length where it has several. */
export function firearmsFrom(variant: Variant, url: string, retrieved: string): { guns: Firearm[]; skipped: string[] } {
  const guns: Firearm[] = [];
  const skipped: string[] = [];
  if (!variant.audiences.some((audience) => audience !== 'defence')) {
    return { guns, skipped: [`${variant.title}: only for authorities`] };
  }
  const barrels = barrelsOf(variant.details);
  const perCartridgeBarrel = barrels.length > 0 && barrels.every((barrel) => barrel.twist !== undefined);
  for (const entry of cartridgesOf(variant.details)) {
    if (!loadableCartridge(entry.cartridge)) {
      skipped.push(`${variant.title}: ${entry.cartridge} is not a cartridge to load for`);
      continue;
    }
    const taken = perCartridgeBarrel ? barrels : [barrelFor(entry.cartridge, barrels)];
    for (const barrel of taken) {
      if (barrel === undefined) {
        skipped.push(`${variant.title} ${entry.cartridge}: the page gives no barrel of its own`);
        continue;
      }
      const length = printedLength(barrel.length);
      if (length === undefined) {
        skipped.push(`${variant.title} ${entry.cartridge}: no single barrel length in "${barrel.length}"`);
        continue;
      }
      const drall = barrel.twist ?? entry.twist;
      const twist = drall === undefined ? undefined : printedTwist(drall);
      const weight = weightFor(variant.details, barrel);
      const gunMass = weight === undefined ? undefined : plausibleGunMass(printedMass(weight));
      const named = `Haenel ${variant.title} ${entry.cartridge}`;
      const name = perCartridgeBarrel && barrels.length > 1 ? `${named} ${Number((length * 1000).toFixed(1))} mm barrel` : named;
      guns.push({
        format: FIREARM_FORMAT,
        schemaVersion: FIREARM_SCHEMA_VERSION,
        name,
        maker: 'Haenel',
        model: variant.title,
        cartridge: entry.cartridge,
        barrel: {
          name,
          length,
          ...(twist === undefined ? {} : { twistLength: twist }),
          ...(gunMass === undefined ? {} : { gunMass }),
          gasLeaks: [],
        },
        source: {
          kind: 'published',
          publisher: 'C.G. Haenel GmbH',
          url,
          retrieved,
          ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
          published: publishedFigures({ barrelLength: barrel.length, weight: gunMass === undefined ? undefined : weight, twist: drall }),
        },
      });
    }
  }
  return { guns, skipped };
}

/** The figures that tell two guns of one name apart. */
function figures(gun: Firearm): string {
  const { length, twistLength, gunMass } = gun.barrel;
  return [length, twistLength, gunMass].join('/');
}

async function main(): Promise<void> {
  const args = crawlArguments('haenel', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = productPages(await fetchText(SITEMAP)).slice(0, limit);
  console.log(`${pages.length} product pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const kept = new Map<string, Firearm>();
  const skipped: string[] = [];
  for (const url of pages) {
    let page: string;
    try {
      page = await fetchPage(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const found = variants(page);
    if (found.length === 0) skipped.push(`${url}: no variant block`);
    for (const variant of found) {
      const result = firearmsFrom(variant, url, retrieved);
      skipped.push(...result.skipped.map((reason) => `${url}: ${reason}`));
      for (const gun of result.guns) {
        const earlier = kept.get(gun.name);
        if (earlier === undefined) kept.set(gun.name, gun);
        else if (figures(earlier) !== figures(gun)) skipped.push(`${url}: ${gun.name} disagrees with ${earlier.source?.url} (${figures(earlier)} against ${figures(gun)}); the first is kept`);
      }
    }
  }
  let written = 0;
  for (const gun of kept.values()) {
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
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
