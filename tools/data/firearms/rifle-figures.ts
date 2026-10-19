/**
 * How a rifle maker's page prints the chamberings of one model: a table whose every row is a gun
 * (issue #30). Weatherby's pages are shaped that way, and theirs is the only extractor reading this
 * today. Another maker whose pages list chamberings the same way reads through this module as it
 * stands; what stays in a maker's own file is which pages to read and what their cells mean.
 *
 * These makers print in inches and pounds, some of them with the metric figure beside it. Every reader
 * here returns SI (metres, kilograms) together with the value of the last printed digit, so that a
 * measure printed in two units can keep whichever was printed to the finer step (docs/firearm-data.md,
 * ruger.ts). A reader returns nothing for a figure it cannot place: a range, a bare number with no unit,
 * a `configuration dependent` weight. Nothing here guesses.
 *
 * The record and the crawl are the shared ones (`printed-figures.ts`); what is this module's own is the
 * table, the figures in its cells, and the naming of a model sold with two barrels in one cartridge.
 */
import { units } from '@gordons-legacy/formats';
import { finest, type Reading } from './finest-reading.ts';
import { plainText, plausibleGunMass } from './maker-site.ts';
import { firearmRecord, type GunFacts, type PageReading } from './printed-figures.ts';

const OUNCE = units.POUND / 16; // kg

/** A table of a page: its header cells and its rows, as plain text. */
export interface Table {
  header: string[];
  rows: string[][];
}

/** Every table of a page, the first row being its header (whether the maker wrote `th` or `td`). */
export function tablesOf(markup: string): Table[] {
  const tables: Table[] = [];
  for (const [, body] of markup.matchAll(/<table[^>]*>(.*?)<\/table>/gs)) {
    const rows = [...body!.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row]) =>
      [...row!.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map(([, cell]) => plainText(cell!)),
    );
    if (rows.length > 0) tables.push({ header: rows[0]!, rows: rows.slice(1) });
  }
  return tables;
}

/** The index of the first header cell matching a pattern, or -1. */
export function columnOf(table: Table, pattern: RegExp): number {
  return table.header.findIndex((cell) => pattern.test(cell));
}

/** The reading of the first `<number> <unit>` in a text, or nothing. */
function readingOf(text: string, unit: string, si: number): Reading | undefined {
  const match = new RegExp(`(?<![0-9.:])([0-9]+(?:\\.[0-9]+)?)\\s*${unit}`, 'i').exec(text.replace(/(?<=[0-9]),(?=[0-9]{3}\b)/g, ''));
  if (!match) return undefined;
  const printed = match[1]!;
  return { value: Number(printed) * si, step: 10 ** -(printed.split('.')[1]?.length ?? 0) * si };
}

/** A length printed in inches (`24"`, `20.6 in`, `26 inches`). The text has been through `plainText`. */
export function inches(text: string): Reading | undefined {
  return readingOf(text, '(?:"|in\\b|inch(?:es)?\\b)', units.INCH);
}

/** A length printed in millimetres or centimetres (`737 mm`, `51.44 cm`). */
export function metricLength(text: string): Reading | undefined {
  return finest([readingOf(text, 'mm\\b', units.MILLIMETRE), readingOf(text, 'cm\\b', 10 * units.MILLIMETRE)]);
}

/**
 * A barrel length from text that may print it twice (`26" (660 mm)`), as the finer figure. A muzzle
 * brake counted into the length (`24" (22" barrel + 2" muzzle brake)`) is not part of the barrel, so
 * the figure before the word `barrel` is taken instead of the first one; a text that mentions a brake
 * without saying how much of the length is barrel gives nothing.
 */
export function barrelLength(text: string): Reading | undefined {
  // `break` is Weatherby's own spelling of it, on about a third of their pages: without it the brake
  // was counted into the barrel, making a 22" barrel 24" long (2026-10-16).
  if (/brakes?|breaks?|compensator|suppressor|silencer/i.test(text)) {
    const barrel = /([0-9]+(?:\.[0-9]+)?)\s*(?:"|in\b|inch(?:es)?)\s*barrel/i.exec(text);
    return barrel ? inches(`${barrel[1]}"`) : undefined;
  }
  if (/\bor\b|\/|,|\bto\b/i.test(text)) return undefined; // several barrels in one cell: no single gun
  return finest([inches(text), metricLength(text)]);
}

/**
 * A mass printed in pounds and ounces (`7.5 lbs`, `5.3lbs.`, `7lb 10.9oz`, `7lbs 8oz`) or kilograms
 * (`6.6 kg`), as the finer figure. Two weights in one text (a range, `5.8 lbs to 6.4 lbs`) or a weight
 * that depends on the configuration give nothing: no single gun has that mass.
 */
export function gunMass(text: string): Reading | undefined {
  if (/configuration|depend|approx|range|\bto\b|[–—]/i.test(text)) return undefined;
  if ((text.match(/\blbs?\b|\bkg\b/gi) ?? []).length > 2) return undefined;
  const pounds = readingOf(text, 'lbs?\\b\\.?', units.POUND);
  const ounces = readingOf(text, 'oz\\b', OUNCE);
  const customary =
    pounds === undefined && ounces === undefined
      ? undefined
      : { value: (pounds?.value ?? 0) + (ounces?.value ?? 0), step: (ounces ?? pounds!).step };
  const metric = readingOf(text, 'kg\\b', 1);
  const best = finest([customary, metric]);
  return best && plausibleGunMass(best.value) !== undefined ? best : undefined;
}

/**
 * The turn of rifling in metres from `1:8`, `1 : 9.4"`, `1-8"` or `1 in 32"`. These makers print the
 * twist in inches throughout, so a figure with no unit is inches; a millimetre figure is taken as such.
 * A range (`1:7 to 1:10`) or a second figure that differs gives nothing. So does a turn shorter than
 * 100 mm (1:3.9"): that is the shortest check-corpus.ts accepts, and the one gun that prints a 1:3 twist
 * (an 8.6 Blackout) is better without a twist than refused whole.
 */
export function twistLength(text: string): number | undefined {
  const turns = [...text.matchAll(/(?<![0-9])1\s*(?::|-|in\b)\s*([0-9]+(?:\.[0-9]+)?)\s*("|in\b|mm\b)?/gi)];
  if (turns.length === 0 || /\bor\b|\bto\b|\//i.test(text)) return undefined;
  const values = turns.map(([, number, unit]) => Number(number) * (unit?.toLowerCase() === 'mm' ? units.MILLIMETRE : units.INCH));
  return values.every((value) => Math.abs(value - values[0]!) < 1e-9) && values[0]! >= 0.1 ? values[0] : undefined;
}


/**
 * The guns a page listing a model's chamberings holds, as the shared crawl writes them
 * (`printed-figures.ts`): one row of the table is one gun, and `left` holds what the reader itself
 * could not use. A page that gives nothing says so once, so that a parser which has stopped working
 * does not look like a catalogue that has emptied.
 */
export function chamberings(guns: readonly GunFacts[], left: readonly string[]): PageReading[] {
  const { kept, dropped } = distinguished(guns);
  const skipped = [...left, ...dropped];
  if (kept.length === 0 && left.length === 0) skipped.push('no gun with a cartridge and a barrel length');
  return [...skipped.map((reason) => ({ skipped: reason })), ...kept.map((gun) => ({ firearm: firearmRecord(gun) }))];
}

/**
 * Names for the guns of one page. A model sold in the same cartridge with two barrel lengths is two
 * guns, and the length goes into both names (`... 50 BMG 29"`); one that differs in nothing the record
 * holds is the same gun twice, and the second is left out.
 *
 * Returns the guns to write, and the reasons for those left out.
 */
export function distinguished(guns: readonly GunFacts[]): { kept: GunFacts[]; dropped: string[] } {
  const byName = new Map<string, GunFacts[]>();
  for (const gun of guns) {
    const key = gun.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), gun]);
  }
  const kept: GunFacts[] = [];
  const dropped: string[] = [];
  for (const group of byName.values()) {
    const barrels = new Set(group.map((gun) => gun.barrelLength.toFixed(5)));
    const first = new Map<string, GunFacts>(); // by barrel length
    for (const gun of group) {
      const barrel = gun.barrelLength.toFixed(5);
      const earlier = first.get(barrel);
      const printedBarrel = gun.published['barrelLength'];
      if (earlier === undefined) {
        const labelled = barrels.size > 1 && printedBarrel ? { ...gun, name: `${gun.name} ${printedBarrel}` } : gun;
        first.set(barrel, labelled);
        kept.push(labelled);
      } else if (earlier.twistLength !== gun.twistLength || earlier.gunMass !== gun.gunMass) {
        dropped.push(`${gun.cartridge} ${printedBarrel}: listed twice with different figures; only the first is kept`);
      }
    }
  }
  return { kept, dropped };
}
