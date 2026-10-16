/**
 * How the American makers print a barrel length, a weight and a twist, and how a crawl of their pages is
 * written out (issue #30, docs/firearm-data.md). Shared by the extractors of Colt, FN America, Daniel
 * Defense, Wilson Combat, Nighthawk, Bond Arms, Magnum Research, Kel-Tec, Ed Brown, Girsan and Benelli.
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
import { publishedFigures } from './published-figures.ts';
import { crawlArguments, DELAY, fetchPage, fileName, firearmJson, plainText, plausibleGunMass, summaryLine } from './maker-site.ts';

/**
 * A page as the lines a reader sees, one per block element (`<li>`, `<p>`, `<div>`, `<tr>`, `<td>`,
 * `<dt>`, `<dd>`, headings), scripts and styles out. A specification is a label and a value that sit in
 * neighbouring blocks or in one `Label: value` line, and `plainText` alone would run them together.
 */
export function textLines(markup: string): string[] {
  return markup
    .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|ul|tr|td|th|dt|dd|h[1-6]|section|span)>/gi, '\n')
    .split('\n')
    .map(plainText)
    .filter((line) => line !== '');
}

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
 * A figure as its maker printed it: the value in SI, and what its last digit is worth, also in SI.
 *
 * A page that prints a measure in two units rounds the two differently (`16.1"` is 408.9 mm, and the
 * millimetres beside it say so), so the one printed to the finer step wins, whichever unit it is in.
 */
interface Reading {
  /** SI: metres or kilograms. */
  value: number;
  /** SI value of the last published digit: 0.1 inch is 2.54e-3 m, 1 mm is 1e-3 m. */
  step: number;
}

/** The first figure in `text` followed by one of `units` (a regular expression), as a reading. */
function reading(text: string, unitPattern: string, si: number): Reading | undefined {
  const match = new RegExp(`(?<![0-9.])([0-9]+(?:\\.[0-9]+)?)\\s*(?:${unitPattern})(?![a-z])`, 'i').exec(text);
  if (!match) return undefined;
  const decimals = match[1]!.split('.')[1]?.length ?? 0;
  return { value: Number(match[1]) * si, step: 10 ** -decimals * si };
}

/** Of several readings of one measure, the value of the one printed to the finest step. */
function finest(readings: (Reading | undefined)[]): number | undefined {
  const known = readings.filter((entry): entry is Reading => entry !== undefined);
  if (known.length === 0) return undefined;
  return known.reduce((best, entry) => (entry.step < best.step ? entry : best)).value;
}

/**
 * `5"`, `5 inch`, `16.1" (408.9 mm)`, `120.5 mm` → metres. A number with no unit is not read: the
 * pages that print one say so in their own words, and a bare number is a guess.
 */
export function length(text: string): number | undefined {
  const value = finest([
    reading(text, 'mm', units.MILLIMETRE),
    reading(text, 'cm', 10 * units.MILLIMETRE),
    reading(text, '"|in|inch|inches', units.INCH),
  ]);
  return value === undefined ? undefined : tidy(value);
}

/**
 * `41 OZ`, `6.6lbs (3.0kg)`, `5 lbs 13.1oz`, `19 ounces` → kilograms, or nothing when the figure cannot
 * be a gun's (a placeholder, a parcel). `6 lbs 2 oz` is one figure in two words; its step is the
 * ounce's.
 */
export function mass(text: string): number | undefined {
  const pounds = reading(text, 'lbs?\\.?|pounds?', units.POUND);
  const ounces = reading(text, 'oz\\.?|ounces?', OUNCE);
  const customary =
    pounds === undefined && ounces === undefined
      ? undefined
      : { value: (pounds?.value ?? 0) + (ounces?.value ?? 0), step: (ounces ?? pounds!).step };
  const value = finest([reading(text, 'kg', 1), reading(text, 'g|grams?', units.GRAM), customary]);
  return plausibleGunMass(value === undefined ? undefined : tidy(value));
}

/**
 * `1:7 RH, 6 Groove`, `1-10 Twist`, `1 in 11"`, `1:16"` → metres of barrel per turn. These makers all
 * print it in inches and many leave the unit out (`1:7`), which is the convention of the trade; a turn
 * outside what rifling can be (3 to 40 inches) is another number and is not read.
 */
export function twist(text: string): number | undefined {
  const match = /(?<![0-9])1\s*(?::|-|\s+in\s+)\s*([0-9]+(?:\.[0-9]+)?)(?![0-9])\s*(mm)?/i.exec(text);
  if (!match) return undefined;
  const turn = Number(match[1]);
  if (match[2] !== undefined) return tidy(turn * units.MILLIMETRE);
  return turn >= 3 && turn <= 40 ? tidy(turn * units.INCH) : undefined;
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
  massBasis?: 'without-magazine' | 'empty-magazine' | 'loaded' | 'unstated' | undefined;
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
 * What two listings of the same gun disagree on, for the skip list. Empty when they agree. The second
 * listing is skipped rather than merged: nothing on either page says which figure supersedes the other,
 * and averaging them would put a figure in a record that no maker printed.
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

/**
 * Walks `urls`, a second apart (or `delay`), asks `read` what each page holds, settles a name taken
 * twice before anything is serialised, and writes one file per gun. Prints the log and the skip list
 * grouped by reason.
 *
 * A name clash is settled here: the same name with another cartridge is another gun and takes its
 * cartridge in its name; the same name with the same cartridge is a second listing and is skipped with
 * the disagreement printed.
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
      const { firearm } = result;
      const taken = writtenFiles.get(fileName(firearm));
      if (taken !== undefined && taken.cartridge !== firearm.cartridge) {
        firearm.name = `${firearm.name} ${firearm.cartridge}`;
        firearm.barrel.name = firearm.name;
      }
      const file = fileName(firearm);
      const same = writtenFiles.get(file);
      if (same !== undefined) {
        skipped.push({ url, reason: `${firearm.name} is already written${difference(same, firearm)}` });
        continue;
      }
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push({ url, reason: json.problem });
        continue;
      }
      writtenFiles.set(file, firearm);
      writeFileSync(join(folder, file), json.text);
      console.log(summaryLine(firearm));
    }
  }
  console.log(`\n${writtenFiles.size} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages or guns skipped:`);
    for (const { url, reason } of skipped) console.log(` - ${url}: ${reason}`);
  }
}
