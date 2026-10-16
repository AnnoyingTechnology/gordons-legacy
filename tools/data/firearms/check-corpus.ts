/**
 * Checks what an extractor wrote, before any of it is published (issue #30, docs/firearm-data.md):
 *
 *     deno run -A tools/data/firearms/check-corpus.ts /tmp/gl/guns-glock /tmp/gl/guns-ruger
 *
 * Two questions, asked of every record:
 *
 * 1. Does each SI figure agree with the maker's own printed string in `source.published`? A unit
 *    mix-up, a lost digit or a centimetre read as a millimetre is invisible in a file of 3,000 guns,
 *    and the printed string is the only witness of what the page said.
 * 2. Can the figure be a gun's at all? A page's placeholder (Savage prints `9999 lbs` where it holds
 *    no weight) or a shipping weight must never become the mass the engine recoils.
 *
 * 3. Does the record say where it comes from? A figure nobody can trace back to a page and a date is
 *    not a published figure, and a mass whose basis is unsaid must say so (`unstated`) rather than
 *    leave the field out.
 * 4. Is it a gun a reloader can load for? A rimfire or a shotgun gauge in the corpus means an extractor's
 *    filter has a hole — the chooser would offer a .22 LR rifle for a cartridge nobody can load it with.
 *
 * It reads the files only — no page is fetched — so it costs a maker's site nothing and can be run
 * after every crawl. Two guns of one name in one folder are reported too: that is an extractor reading
 * two pages as one gun, and the export would publish whichever it read last.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirearm, units, type Firearm } from '@gordons-legacy/formats';
import { loadableCartridge } from './loadable-cartridge.ts';
import { plausibleGunMass } from './maker-site.ts';

/** A number as a maker writes it, with either decimal mark: `9.5` and `9,5` are the same figure. */
const NUMBER = String.raw`([0-9]+(?:[.,][0-9]+)?)`;

/** The shortest and longest a barrel can be, m: a 1.9" derringer to a 36" long-range rifle, with room. */
const BARREL_LENGTH_RANGE = { shortest: 0.04, longest: 1.0 };

/** The shortest and longest turn of rifling, m: a 1:6" pistol barrel to a 1:40" muzzle-loader, with room. */
const TWIST_RANGE = { shortest: 0.1, longest: 1.2 };

/** How close a figure must be to its printed string: half a millimetre, or half a percent of it. */
const TOLERANCE = { length: 0.0006, mass: 0.002, relative: 0.005 };

/**
 * The figures a printed number can mean. A number is usually one figure, but a group of exactly three
 * digits behind the mark is ambiguous between the two conventions a catalogue may follow: Schmeisser's
 * `3.250 g` is three thousand two hundred and fifty grams, and an English page's `3.250 kg` would be
 * three and a quarter kilograms. Both readings are offered, and a figure that matches either agrees —
 * which is what this file asks. It is not the place to decide how a maker punctuates.
 */
function values(text: string): number[] {
  const decimal = Number(text.replace(',', '.'));
  const grouped = /^[0-9]{1,3}[.,][0-9]{3}$/.test(text) ? [Number(text.replace(/[.,]/, ''))] : [];
  return [decimal, ...grouped];
}

/**
 * The lengths a printed string can mean, in metres. A string with no unit at all is read as inches,
 * which is how Smith & Wesson print a barrel length (`4.22`), and their own prose repeats it as `4.22”`.
 */
export function printedLengths(text: string): number[] {
  const fractions = printedFractions(text);
  if (fractions.length > 0) return fractions;
  const written = [...text.matchAll(new RegExp(`${NUMBER}\\s*(mm|cm|m\\b|in\\b|inch(?:es)?|"|”)`, 'gi'))].flatMap(([, number, unit]) => {
    const metres = { mm: units.MILLIMETRE, cm: 10 * units.MILLIMETRE, m: 1 }[unit!.toLowerCase()] ?? units.INCH;
    return values(number!).map((figure) => figure * metres);
  });
  if (written.length > 0) return written;
  return [...text.matchAll(new RegExp(NUMBER, 'g'))].flatMap(([, number]) => values(number!).map((figure) => figure * units.INCH));
}

/**
 * The inches an imperial fraction means, in metres: Browning prints a barrel as `7 1/2"` and `16 1/2"`,
 * which is how a gunsmith writes it and how no decimal reader reads it.
 */
export function printedFractions(text: string): number[] {
  return [...text.matchAll(/(?:([0-9]+)\s+)?([0-9]+)\s*\/\s*([0-9]+)\s*(?:"|”|in\b|inch(?:es)?)?/g)].map(([, whole, numerator, denominator]) => {
    return (Number(whole ?? 0) + Number(numerator) / Number(denominator)) * units.INCH;
  });
}

/**
 * The masses a printed string can mean, in kilograms. `6 lbs. 2 oz.` is one figure in two words.
 *
 * `gr` is read as grams, not grains: Girsan print `830 gr.` for a pistol of 830 g, and no maker gives a
 * gun's weight in grains — a grain is for a bullet or a charge, and 830 of them would be 54 g.
 */
export function printedMasses(text: string): number[] {
  const ounce = units.POUND / 16;
  const masses = [...text.matchAll(new RegExp(`${NUMBER}\\s*(kg|gr?\\b|oz|lbs?)`, 'gi'))].flatMap(([, number, unit]) => {
    const kilograms = { kg: 1, g: units.GRAM, gr: units.GRAM, oz: ounce }[unit!.toLowerCase()] ?? units.POUND;
    return values(number!).map((figure) => figure * kilograms);
  });
  const both = new RegExp(`${NUMBER}\\s*lbs?\\.?\\s*${NUMBER}\\s*oz`, 'i').exec(text);
  return both ? [...masses, values(both[1]!)[0]! * units.POUND + values(both[2]!)[0]! * ounce] : masses;
}

/**
 * The turns of rifling a printed string can mean, in metres: `1:9,5"`, `1:203 mm`, a bare `1:10`, and —
 * since the field is the twist and nothing else — the turn on its own, which is how Browning prints it
 * (`10"` for one turn in ten inches, `9 1/2"` for one in nine and a half).
 */
export function printedTwists(text: string): number[] {
  const ratios = [...text.matchAll(new RegExp(`1\\s*(?:[:-]|in\\b)\\s*${NUMBER}\\s*(mm|cm|in\\b|inch(?:es)?|"|”)?`, 'gi'))].flatMap(([, number, unit]) => {
    const metres = { mm: units.MILLIMETRE, cm: 10 * units.MILLIMETRE }[unit?.toLowerCase() ?? ''] ?? units.INCH;
    return values(number!).map((figure) => figure * metres);
  });
  return ratios.length > 0 ? ratios : printedLengths(text);
}

/** Whether a figure is one of the printed string's readings, to the tolerance above. */
function agrees(figure: number, printed: number[], absolute: number): boolean {
  return printed.some((candidate) => Math.abs(figure - candidate) <= Math.max(absolute, TOLERANCE.relative * figure));
}

/**
 * Whether a printed string names two different figures of one unit, which a record has to choose
 * between: FN prints `20" or 24"` for a rifle sold with either barrel, and `11.5 or 11.75 lb.` for its
 * weight. A record that takes one of them is a guess, and it passes the comparison above — the figure
 * does agree with one of the readings — so the choice itself has to be the question.
 *
 * One figure printed in two units is not a choice, however coarsely the maker rounded the second
 * (`16.1" (408.9 mm)`, Kel-Tec's `4.36 lb | 1.9 kg`): the comparison above already asks whether the
 * record agrees with one of them. Neither is a length that says which part of it is the barrel —
 * Weatherby print `24" (22" barrel + 2" muzzle brake)`, and the 22" is the figure a record must take
 * (`break` included: that is how Weatherby spell it).
 */
const UNIT_SPELLINGS = ['"|”|in\\b|inch(?:es)?\\b', 'mm\\b', 'cm\\b', 'lbs?\\b', 'oz\\b', 'kg\\b', 'gr?\\b'];

function namesAChoice(text: string): boolean {
  if (/\bbarrel\b/i.test(text) && /brakes?|breaks?|compensator|suppressor|silencer/i.test(text)) return false;
  // The `1` of a ratio is not a figure of the measure: `1 in 12"` names one turn, not a 1" and a 12".
  const measures = text.replace(/\b1\s*(?::|-|in\b|turn\s+(?:right|left)\s+in)\s*(?=[0-9])/gi, ' ');
  return UNIT_SPELLINGS.some((unit) => {
    const figures = [...measures.matchAll(new RegExp(`${NUMBER}\\s*(?:${unit})`, 'gi'))].map(([, number]) => Number(number!.replace(',', '.')));
    const first = figures[0];
    if (first === undefined) return false;
    return !figures.every((figure) => Math.abs(figure - first) <= TOLERANCE.relative * first);
  });
}

/** A date as a record must carry it: the day a page was read, which is a day that has happened. */
function readableDate(date: string | undefined): boolean {
  return date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= new Date().toISOString().slice(0, 10);
}

/** What is wrong with a record, in words; empty when nothing is. */
export function auditFirearm(firearm: Firearm): string[] {
  const problems: string[] = [];
  const { length, gunMass, twistLength } = firearm.barrel;
  const source = firearm.source;
  const published = source?.published ?? {};
  if (source?.kind !== 'published') {
    problems.push('no published source, so no page and no date say where the figures come from');
  } else {
    if (source.url === undefined || !source.url.startsWith('http')) problems.push(`the source names no page (${source.url ?? 'nothing'})`);
    if (!readableDate(source.retrieved)) problems.push(`read on "${source.retrieved ?? 'nothing'}", which is not a day that has passed`);
    if (source.publisher === undefined || source.publisher === '') problems.push('the source names no publisher');
    if (gunMass !== undefined && source.massBasis === undefined) {
      problems.push('a mass that does not say what it includes; `unstated` is the honest value, not a missing field');
    }
    if (Object.keys(published).length === 0) problems.push("none of the maker's own strings were kept, so no figure can be checked");
  }
  if (!loadableCartridge(firearm.cartridge)) {
    problems.push(`"${firearm.cartridge ?? 'no cartridge'}" is not a cartridge a reloader loads`);
  }
  if (length < BARREL_LENGTH_RANGE.shortest || length > BARREL_LENGTH_RANGE.longest) {
    problems.push(`a barrel of ${(length * 1000).toFixed(1)} mm is not a barrel`);
  }
  if (gunMass !== undefined && plausibleGunMass(gunMass) === undefined) {
    problems.push(`a gun of ${gunMass.toFixed(3)} kg is not a gun`);
  }
  if (twistLength !== undefined && (twistLength < TWIST_RANGE.shortest || twistLength > TWIST_RANGE.longest)) {
    problems.push(`a turn of ${(twistLength * 1000).toFixed(1)} mm is not a twist`);
  }
  const barrelLength = published['barrelLength'];
  if (barrelLength !== undefined) {
    const printed = printedLengths(barrelLength);
    if (namesAChoice(barrelLength)) problems.push(`a barrel chosen out of the maker's "${barrelLength}"`);
    else if (!agrees(length, printed, TOLERANCE.length)) {
      problems.push(`barrel ${(length * 1000).toFixed(1)} mm, where the maker printed "${barrelLength}"`);
    }
  }
  const weight = published['weight'];
  if (gunMass !== undefined && weight !== undefined) {
    const printed = printedMasses(weight);
    if (namesAChoice(weight)) problems.push(`a mass chosen out of the maker's "${weight}"`);
    else if (!agrees(gunMass, printed, TOLERANCE.mass)) {
      problems.push(`mass ${gunMass.toFixed(3)} kg, where the maker printed "${weight}"`);
    }
  }
  const twist = published['twist'];
  if (twistLength !== undefined && twist !== undefined) {
    const printed = printedTwists(twist);
    if (namesAChoice(twist)) problems.push(`a twist chosen out of the maker's "${twist}"`);
    else if (!agrees(twistLength, printed, TOLERANCE.length)) {
      problems.push(`twist ${(twistLength * 1000).toFixed(1)} mm, where the maker printed "${twist}"`);
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const folders = process.argv.slice(2);
  if (folders.length === 0) {
    console.error('usage: deno run -A tools/data/firearms/check-corpus.ts <folder of .firearm.json>...');
    process.exitCode = 1;
    return;
  }
  let checked = 0;
  const problems: string[] = [];
  for (const folder of folders) {
    const names = new Map<string, string>();
    for (const file of readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.firearm.json'))) {
      const result = parseFirearm(readFileSync(join(folder, file), 'utf8'));
      if (!result.ok) {
        problems.push(`${folder}/${file}: ${result.issues.map((issue) => `${issue.path ?? '?'}: ${issue.message}`).join('; ')}`);
        continue;
      }
      checked++;
      const taken = names.get(result.value.name);
      if (taken !== undefined) problems.push(`${folder}/${file}: the same gun name as ${taken}`);
      else names.set(result.value.name, file);
      for (const problem of auditFirearm(result.value)) problems.push(`${folder}/${file}: ${problem}`);
    }
  }
  console.log(`${checked} records checked, ${problems.length} problems`);
  for (const problem of problems) console.log(' -', problem);
  if (problems.length > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
