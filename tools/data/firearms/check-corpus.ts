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
import { plausibleGunMass } from './maker-site.ts';

/** A number as a maker writes it, with either decimal mark: `9.5` and `9,5` are the same figure. */
const NUMBER = String.raw`([0-9]+(?:[.,][0-9]+)?)`;

/** The shortest and longest a barrel can be, m: a 1.9" derringer to a 36" long-range rifle, with room. */
const BARREL_LENGTH_RANGE = { shortest: 0.04, longest: 1.0 };

/** The shortest and longest turn of rifling, m: a 1:6" pistol barrel to a 1:40" muzzle-loader, with room. */
const TWIST_RANGE = { shortest: 0.1, longest: 1.2 };

/** How close a figure must be to its printed string: half a millimetre, or half a percent of it. */
const TOLERANCE = { length: 0.0006, mass: 0.002, relative: 0.005 };

function value(text: string): number {
  return Number(text.replace(',', '.'));
}

/**
 * The lengths a printed string can mean, in metres. A string with no unit at all is read as inches,
 * which is how Smith & Wesson print a barrel length (`4.22`), and their own prose repeats it as `4.22”`.
 */
export function printedLengths(text: string): number[] {
  const written = [...text.matchAll(new RegExp(`${NUMBER}\\s*(mm|cm|m\\b|in\\b|inch(?:es)?|"|”)`, 'gi'))].map(([, number, unit]) => {
    const metres = { mm: units.MILLIMETRE, cm: 10 * units.MILLIMETRE, m: 1 }[unit!.toLowerCase()] ?? units.INCH;
    return value(number!) * metres;
  });
  if (written.length > 0) return written;
  return [...text.matchAll(new RegExp(NUMBER, 'g'))].map(([, number]) => value(number!) * units.INCH);
}

/** The masses a printed string can mean, in kilograms. `6 lbs. 2 oz.` is one figure in two words. */
export function printedMasses(text: string): number[] {
  const ounce = units.POUND / 16;
  const masses = [...text.matchAll(new RegExp(`${NUMBER}\\s*(kg|g\\b|oz|lbs?)`, 'gi'))].map(([, number, unit]) => {
    const kilograms = { kg: 1, g: units.GRAM, oz: ounce }[unit!.toLowerCase()] ?? units.POUND;
    return value(number!) * kilograms;
  });
  const both = new RegExp(`${NUMBER}\\s*lbs?\\.?\\s*${NUMBER}\\s*oz`, 'i').exec(text);
  return both ? [...masses, value(both[1]!) * units.POUND + value(both[2]!) * ounce] : masses;
}

/** The turns of rifling a printed string can mean, in metres: `1:9,5"`, `1:203 mm`, or a bare `1:10`. */
export function printedTwists(text: string): number[] {
  return [...text.matchAll(new RegExp(`1\\s*[:-]\\s*${NUMBER}\\s*(mm|cm|in\\b|inch(?:es)?|"|”)?`, 'gi'))].map(([, number, unit]) => {
    const metres = { mm: units.MILLIMETRE, cm: 10 * units.MILLIMETRE }[unit?.toLowerCase() ?? ''] ?? units.INCH;
    return value(number!) * metres;
  });
}

/** Whether a figure is one of the printed string's readings, to the tolerance above. */
function agrees(figure: number, printed: number[], absolute: number): boolean {
  return printed.some((candidate) => Math.abs(figure - candidate) <= Math.max(absolute, TOLERANCE.relative * figure));
}

/**
 * What a reloader cannot load for, and what must therefore never reach a record: the rimfire cartridges
 * and the shotgun gauges. Written out one by one rather than as a clever pattern, because the names that
 * look alike are the ones that matter — `.22 LR` is rimfire, `.22 Hornet`, `.22-250` and `.223` are not.
 */
const UNLOADABLE = [
  // .22 rimfire, in every spelling the makers print, `22 S L LR` (short, long and long rifle) included.
  /\b\.?22\s*(s\s*l\s*lr|lr|l\.r\.|l\b|long|short|wmr|wrf|win\s*mag|magnum|mag\b|bb|cb)\b/i,
  // .17 rimfire: HMR, Mach 2 (which Browning prints `17 M 2`) and the .17 Winchester Super Magnum.
  /\b\.?17\s*(hmr|hm2|m\s*2|mach\s*2|wsm)\b/i,
  /\b\.?21\s*sharp\b/i,
  /\b5\s*mm\s*(rem(ington)?\s*)?(rimfire|magnum)\b/i,
  /\b(12|16|20|24|28|32|36)\s*(ga|gauge|gaugé|bore)\b/i,
  /\b\.?410\s*(ga|gauge|bore)\b/i,
  /\bairgun|air\s*rifle|\b177\b|\b4\.5\s*mm\b/i,
];

/** Whether a cartridge is one a reloader can load, as far as its name says. */
export function loadableCartridge(cartridge: string | undefined): boolean {
  return cartridge !== undefined && cartridge !== '' && !UNLOADABLE.some((pattern) => pattern.test(cartridge));
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
  if (barrelLength !== undefined && !agrees(length, printedLengths(barrelLength), TOLERANCE.length)) {
    problems.push(`barrel ${(length * 1000).toFixed(1)} mm, where the maker printed "${barrelLength}"`);
  }
  const weight = published['weight'];
  if (gunMass !== undefined && weight !== undefined && !agrees(gunMass, printedMasses(weight), TOLERANCE.mass)) {
    problems.push(`mass ${gunMass.toFixed(3)} kg, where the maker printed "${weight}"`);
  }
  const twist = published['twist'];
  if (twistLength !== undefined && twist !== undefined && !agrees(twistLength, printedTwists(twist), TOLERANCE.length)) {
    problems.push(`twist ${(twistLength * 1000).toFixed(1)} mm, where the maker printed "${twist}"`);
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
