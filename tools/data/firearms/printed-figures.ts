/**
 * How the American makers print a barrel length, a weight and a twist, and how a crawl of their pages is
 * written out (issue #30, docs/firearm-data.md). Read through by the extractors of Colt, Ed Brown,
 * FN America, Girsan, Kel-Tec and Weatherby (through `rifle-figures.ts`), and the place a new maker of
 * theirs starts.
 *
 * Two jobs, one per half of this file:
 *
 * 1. Reading a figure out of the text of a page: `16.1" (408.9 mm)`, `6.6lbs (3.0kg)`, `1:7 RH`.
 * 2. Writing the guns an extractor found: the second listing of a gun, a crawl's skip list and its
 *    log line are the same for every maker and are done once, here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { finest, type Reading } from './finest-reading.ts';
import { publishedFigures, type MassBasis } from './published-figures.ts';
import { crawlArguments, DELAY, fetchPage, fileName, firearmJson, plausibleGunMass, summaryLine } from './maker-site.ts';

/** A line that names a figure instead of giving one: `Overall Length: 39.63"`, `Twist Rate`. */
function isLabel(line: string | undefined): boolean {
  return line !== undefined && /^[a-z][a-z /.-]{2,}:?$/i.test(line.replace(/:.*$/, ':'));
}

/**
 * The value of a `Label` / value pair or a `Label: value` line, the first one found. `labelled(lines,
 * 'Barrel Length')` finds both `Barrel Length: 3.6"` and a `Barrel Length` line followed by `3.6"`.
 *
 * A label whose value is missing gives nothing, even though the next line holds a figure: FN's M16A4
 * page prints `Barrel Length:` with nothing after it and `Overall Length: 39.63"` on the line below,
 * and taking the neighbour made a 1006.6 mm barrel out of the gun's overall length (2026-10-16).
 */
export function labelled(lines: string[], label: string): string | undefined {
  const wanted = label.toLowerCase();
  for (const [index, line] of lines.entries()) {
    const lower = line.toLowerCase();
    const next = isLabel(lines[index + 1]) ? undefined : lines[index + 1];
    if (lower === wanted) return next;
    if (lower.startsWith(`${wanted}:`)) return line.slice(wanted.length + 1).trim() || next;
  }
  return undefined;
}

/** One avoirdupois ounce, kg: a sixteenth of the pound, exact by definition. */
const OUNCE = units.POUND / 16;

/** Rounds a conversion to the micro-unit, so that `9.8 oz` is saved as 0.277825 kg and not 0.27782532662500004. */
export function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Every figure in `text` followed by one of `unitPattern`'s spellings, as readings of that unit.
 *
 * All of them, not the first: a cell that gives a choice (`20" or 24"`, `11.3 lb. or 11.8 lb.`) looks
 * exactly like one that gives a figure, and taking the first would be a guess about which configuration
 * the page means — which is how FN's SPR A5M got a 20" barrel and an 11.3 lb weight on 2026-10-16.
 */
function readings(text: string, unitPattern: string, si: number): Reading[] {
  const matches = text.matchAll(new RegExp(`(?<![0-9.])([0-9]+(?:\\.[0-9]+)?)\\s*(?:${unitPattern})(?![a-z])`, 'gi'));
  return [...matches].map(([, printed]) => {
    const decimals = printed!.split('.')[1]?.length ?? 0;
    return { value: Number(printed) * si, step: 10 ** -decimals * si };
  });
}

/**
 * The one reading of a unit in `text`, or nothing when the text gives none — or gives two that differ,
 * which is a choice and not a figure. Two equal readings are one figure printed twice.
 */
function reading(text: string, unitPattern: string, si: number): Reading | undefined {
  const found = readings(text, unitPattern, si);
  if (found.length === 0) return undefined;
  return found.every((entry) => Math.abs(entry.value - found[0]!.value) < 1e-12) ? found[0] : undefined;
}

/** Whether a unit appears in `text` but names no single figure: `20" or 24"`. */
function aChoice(text: string, unitPattern: string, si: number): boolean {
  return readings(text, unitPattern, si).length > 0 && reading(text, unitPattern, si) === undefined;
}

/** The three spellings of a length, as the makers print them. */
const LENGTH_UNITS: Array<[string, number]> = [
  ['mm', units.MILLIMETRE],
  ['cm', 10 * units.MILLIMETRE],
  ['"|in|inch|inches', units.INCH],
];

/**
 * `5"`, `5 inch`, `16.1" (408.9 mm)`, `120.5 mm` → metres. A number with no unit is not read: the
 * pages that print one say so in their own words, and a bare number is a guess.
 *
 * `16.1" (408.9 mm)` is one length in two units, and the finer of the two is kept; `20" or 24"` is two
 * lengths in one unit, which is a choice the page does not resolve, and gives nothing.
 */
export function length(text: string): number | undefined {
  if (LENGTH_UNITS.some(([unit, si]) => aChoice(text, unit, si))) return undefined;
  const value = finest(LENGTH_UNITS.map(([unit, si]) => reading(text, unit, si)))?.value;
  return value === undefined ? undefined : tidy(value);
}

/** The spellings of a mass. Pounds and ounces add up (`6 lbs 2 oz`); the rest are the same mass again. */
const MASS_UNITS: Array<[string, number]> = [
  ['lbs?\\.?|pounds?', units.POUND],
  ['oz\\.?|ounces?', OUNCE],
  ['kg', 1],
  ['g|grams?', units.GRAM],
];

/**
 * `41 OZ`, `6.6lbs (3.0kg)`, `5 lbs 13.1oz`, `19 ounces` → kilograms, or nothing when the figure cannot
 * be a gun's (a placeholder, a parcel). `6 lbs 2 oz` is one figure in two words; its step is the
 * ounce's. `11.3 lb. or 11.8 lb.` is two weights, and gives nothing.
 */
export function mass(text: string): number | undefined {
  if (MASS_UNITS.some(([unit, si]) => aChoice(text, unit, si))) return undefined;
  const pounds = reading(text, MASS_UNITS[0]![0], units.POUND);
  const ounces = reading(text, MASS_UNITS[1]![0], OUNCE);
  const customary =
    pounds === undefined && ounces === undefined
      ? undefined
      : { value: (pounds?.value ?? 0) + (ounces?.value ?? 0), step: (ounces ?? pounds!).step };
  const value = finest([reading(text, 'kg', 1), reading(text, 'g|grams?', units.GRAM), customary])?.value;
  return plausibleGunMass(value === undefined ? undefined : tidy(value));
}

/**
 * `1:7 RH, 6 Groove`, `1-10 Twist`, `1 in 11"`, `1:16"` → metres of barrel per turn. These makers all
 * print it in inches and many leave the unit out (`1:7`), which is the convention of the trade; a turn
 * outside what rifling can be (3 to 40 inches) is another number and is not read.
 *
 * A cell holding two different turns — FN prints `1:10" RH (.300); 1:12" RH (.308)` for a rifle sold in
 * two cartridges — names no one gun's twist and gives nothing.
 */
export function twist(text: string): number | undefined {
  const turns = [...text.matchAll(/(?<![0-9])1\s*(?::|-|\s+in\s+)\s*([0-9]+(?:\.[0-9]+)?)(?![0-9])\s*(mm)?/gi)];
  if (turns.length === 0) return undefined;
  const metres = turns.map(([, number, unit]) => Number(number) * (unit === undefined ? units.INCH : units.MILLIMETRE));
  if (!metres.every((turn) => Math.abs(turn - metres[0]!) < 1e-12)) return undefined;
  const turn = metres[0]!;
  if (turns[0]![2] !== undefined) return tidy(turn);
  return turn >= 3 * units.INCH && turn <= 40 * units.INCH ? tidy(turn) : undefined;
}

/** Three-letter words of the names that are words and not model codes (`MC`, `CCU`, `FDE`, `BOA`). */
const ENGLISH_WORDS = new Set(['TWO', 'TAN', 'RED', 'OLD', 'LUX']);

/**
 * A name for the application's list: a name set wholly in capitals (`ANACONDA (45 COLT, 6")`,
 * `COMPACT MC BLACK`) is set in lower case with a capital initial, except codes (words of three letters or fewer, and
 * words with a figure in them), which are model codes (`MC`, `P35`, `M4`). A name with lower case in it is the maker's
 * own typesetting and is left alone.
 */
export function readableName(name: string): string {
  const plain = name.replace(/\s+/g, ' ').trim();
  if (/[a-z]/.test(plain)) return plain;
  return plain.replace(/[A-Z]{3,}/g, (word) => (word.length >= 4 || ENGLISH_WORDS.has(word) ? word[0]! + word.slice(1).toLowerCase() : word));
}

/** `Colt` and `M4 Carbine` → `Colt M4 Carbine`; a name that already starts with the maker is left as it is. */
export function withMaker(maker: string, name: string): string {
  return new RegExp(`^${maker}\\b`, 'i').test(name) ? name : `${maker} ${name}`;
}


// ---------------------------------------------------------------------------------------------------

/** What an extractor knows about a gun when it builds the record; the rest is the same for all. */
export interface GunFacts {
  /** The maker as the application lists it: `Colt`. */
  maker: string;
  /** Who publishes the page, for the source: `Colt's Manufacturing Company LLC`. */
  publisher: string;
  /** The gun's name, maker first: `Colt Python 6"`. */
  name: string;
  /** The model without the maker, when the page gives one. */
  model?: string | undefined;
  /** The cartridge as the maker writes it. */
  cartridge: string;
  /** Barrel length, m. */
  barrelLength: number;
  /** Metres of barrel per turn of rifling, when the page gives it. */
  twistLength?: number | undefined;
  /** Gun mass, kg, when the page gives one. */
  gunMass?: number | undefined;
  /** What the mass includes; `unstated` when the page does not say. Needed when there is a mass. */
  massBasis?: MassBasis | undefined;
  /** The page. */
  url: string;
  /** The day it was read, YYYY-MM-DD. */
  retrieved: string;
  /** The maker's own strings: `barrelLength`, `weight`, `twist`, `caliber`... */
  published: Record<string, string | undefined>;
}

/** The record for a gun: every extractor of this folder builds it the same way. */
export function firearmRecord(facts: GunFacts): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: facts.name,
    maker: facts.maker,
    ...(facts.model ? { model: facts.model } : {}),
    cartridge: facts.cartridge,
    barrel: {
      name: facts.name,
      length: facts.barrelLength,
      ...(facts.twistLength === undefined ? {} : { twistLength: facts.twistLength }),
      ...(facts.gunMass === undefined ? {} : { gunMass: facts.gunMass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: facts.publisher,
      url: facts.url,
      retrieved: facts.retrieved,
      ...(facts.gunMass === undefined ? {} : { massBasis: facts.massBasis ?? 'unstated' }),
      published: publishedFigures(facts.published),
    },
  };
}

/** What reading one page gave: a gun, or the reason it gave none. */
export type PageReading = { firearm: Firearm } | { skipped: string };

/**
 * What two listings of the same gun disagree on, for the skip list. Empty when they agree.
 */
export function difference(written: Firearm, skipped: Firearm): string {
  const figures: Array<[string, string, number | undefined, number | undefined]> = [
    ['barrel length', 'mm', written.barrel.length, skipped.barrel.length],
    ['weight', 'g', written.barrel.gunMass, skipped.barrel.gunMass],
    ['twist', 'mm', written.barrel.twistLength, skipped.barrel.twistLength],
  ];
  const text = (value: number | undefined, unit: string) => (value === undefined ? 'none' : `${(value * 1000).toFixed(1)} ${unit}`);
  const differing = figures
    .filter(([, , kept, left]) => kept !== left)
    .map(([what, unit, kept, left]) => `${what} ${text(kept, unit)} in the record, ${text(left, unit)} on this page`);
  return differing.length === 0 ? '' : `, where the two pages disagree: ${differing.join('; ')}`;
}

/** What to do with a gun read from a page, given the guns already written. */
export type Settled =
  /** Write it: a gun not written yet, possibly renamed apart from one that is. */
  | { write: Firearm }
  /** Write it in place of `replacing`, a listing of the same gun that is lighter or gives no mass. */
  | { write: Firearm; replacing: Firearm }
  /** Write nothing: the gun is written already, and this listing adds nothing to it. */
  | { skip: string };

/**
 * Settles a gun listed again under a name already written (the maintainer's rules of 2026-11-03, #30).
 * Another cartridge is another gun, named apart by its cartridge. The same barrel and twist make the
 * same gun (a twist one page leaves out disagrees with nothing, and that page's listing never replaces one
 * that gives the twist), and only one listing is kept: the heaviest, since a
 * maker's heavier weight is most likely the gun with a loaded magazine; it is kept whole, with its own
 * page as its source, rather than merged. Another barrel length or twist is another configuration, so
 * another gun, named apart by what differs (`… 16.5"`, `… 1:8"`). Nothing is averaged: a figure no
 * page printed never enters a record.
 *
 * `key` gives the name under which a gun is written (its file name); `written` holds the guns written,
 * by that key.
 */
export function settleListing(written: ReadonlyMap<string, Firearm>, firearm: Firearm, key: (firearm: Firearm) => string): Settled {
  let candidate = firearm;
  // Up to three renames, the name each one makes looked up too (another cartridge, barrel and twist).
  for (let attempt = 0; attempt <= 3; attempt++) {
    const first = written.get(key(candidate));
    if (first === undefined) return { write: candidate };
    if (attempt === 3) break;
    if (first.cartridge !== candidate.cartridge) {
      candidate = renamed(candidate, `${candidate.name} ${candidate.cartridge}`);
      continue;
    }
    // A figure one page leaves out is no disagreement: unknown is not another value.
    const sameTwist = first.barrel.twistLength === undefined || candidate.barrel.twistLength === undefined || first.barrel.twistLength === candidate.barrel.twistLength;
    if (first.barrel.length === candidate.barrel.length && sameTwist) {
      const mass = candidate.barrel.gunMass;
      // A listing that leaves out the twist never replaces one that gives it, however heavy: the record
      // would lose what tells this configuration from another of the same barrel (#30 review).
      const losesTwist = candidate.barrel.twistLength === undefined && first.barrel.twistLength !== undefined;
      if (!losesTwist && mass !== undefined && !(first.barrel.gunMass !== undefined && first.barrel.gunMass >= mass)) return { write: candidate, replacing: first };
      return { skip: `${candidate.name} is already written${difference(first, candidate)}${mass === undefined ? '' : ', the heavier kept'}` };
    }
    const sameBarrel = first.barrel.length === candidate.barrel.length;
    candidate = renamed(candidate, `${candidate.name} ${sameBarrel ? twistLabel(candidate) : barrelLabel(candidate)}`);
  }
  return { skip: `${firearm.name} is listed more than three times with other barrels; left for a reading by hand` };
}

/**
 * Writes a gun read from a page into `folder`, settling a name already written by the rules of
 * `settleListing`. `written` holds the guns written, by file name, and is kept up to date. Says why
 * when nothing is written, and when a lighter listing was replaced.
 */
export function writeListing(folder: string, written: Map<string, Firearm>, firearm: Firearm): { note?: string } | { skipped: string } {
  const settled = settleListing(written, firearm, fileName);
  if ('skip' in settled) return { skipped: settled.skip };
  const json = firearmJson(settled.write);
  if ('problem' in json) return { skipped: json.problem };
  const file = fileName(settled.write);
  written.set(file, settled.write);
  writeFileSync(join(folder, file), json.text);
  console.log(summaryLine(settled.write));
  if (!('replacing' in settled)) return {};
  return { note: `${settled.write.name} replaces a lighter listing (${settled.replacing.source?.url ?? 'unknown page'})${difference(settled.replacing, settled.write)}` };
}

/** The gun under another name; its barrel carries the name too, so a load made with it says which gun. */
function renamed(firearm: Firearm, name: string): Firearm {
  return { ...firearm, name, barrel: { ...firearm.barrel, name } };
}

/** A barrel length as the maker printed it, its first form (`20.00" | 50.8 cm` and `20" (508 mm)` give `20.00"`, `20"`), or in mm. */
function barrelLabel(firearm: Firearm): string {
  const printed = firearm.source?.published?.['barrelLength']?.split(/\s*[|(]/)[0]?.trim();
  if (printed) return printed;
  return firearm.barrel.length === undefined ? 'barrel unstated' : `${Math.round(firearm.barrel.length * 1000)} mm`;
}

/** A twist as the maker printed it, or in inches. */
function twistLabel(firearm: Firearm): string {
  const printed = firearm.source?.published?.['twist']?.split(/\s*[|(]/)[0]?.trim();
  if (printed) return printed.startsWith('1:') ? printed : `1:${printed}`;
  const twist = firearm.barrel.twistLength;
  return twist === undefined ? 'twist unstated' : `1:${Number((twist / 0.0254).toFixed(2))}"`;
}

/**
 * Walks `urls`, a second apart (or `delay`), asks `read` what each page holds, settles a name taken
 * twice before anything is serialised, and writes one file per gun. Prints the log and the skip list
 * grouped by reason.
 *
 * A name taken twice is settled by `settleListing`.
 */
export async function crawl(
  maker: string,
  urls: string[],
  read: (page: string, url: string, retrieved: string) => PageReading[],
  delay: number = DELAY,
): Promise<void> {
  const args = crawlArguments(maker, process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = urls.slice(0, limit);
  console.log(`${pages.length} pages to read`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const skipped: Array<{ url: string; reason: string }> = [];
  const writtenFiles = new Map<string, Firearm>();
  for (const url of pages) {
    let page: string;
    try {
      page = await fetchPage(url, delay);
    } catch (error) {
      skipped.push({ url, reason: (error as Error).message.replace(url, '').trim() });
      continue;
    }
    for (const result of read(page, url, retrieved)) {
      if ('skipped' in result) {
        skipped.push({ url, reason: result.skipped });
        continue;
      }
      const outcome = writeListing(folder, writtenFiles, result.firearm);
      if ('skipped' in outcome) skipped.push({ url, reason: outcome.skipped });
      else if (outcome.note) skipped.push({ url, reason: outcome.note });
    }
  }
  console.log(`\n${writtenFiles.size} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages or guns skipped:`);
    for (const { url, reason } of skipped) console.log(` - ${url}: ${reason}`);
  }
}
