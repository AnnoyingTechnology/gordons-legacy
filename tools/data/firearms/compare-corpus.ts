/**
 * The diff a refresh is read as, before anything is published again (issue #30, docs/firearm-data.md):
 *
 *     deno run -A tools/data/firearms/compare-corpus.ts <published maker file or folder>... <fresh folder>
 *     deno run -A tools/data/firearms/compare-corpus.ts /tmp/gl/data-repo/firearms/bergara.json /tmp/gl/recrawl-bergara
 *     deno run -A .../compare-corpus.ts repo/firearms/sako.json repo/firearms/tikka.json /tmp/gl/recrawl-sako
 *
 * The last argument is the fresh folder; everything before it is what is published today. One crawl can
 * feed several maker files — `sako.ts` reads Sako and Tikka, which the export writes separately — and
 * comparing against one of them would report the other maker's whole catalogue as new.
 *
 * The rule the documentation states — "a refresh is a reviewed diff, and a gun that has left a catalogue
 * is not deleted" — is unreadable by hand over three thousand guns, so it was not really being followed.
 * This prints the three things a person has to decide on:
 *
 * - guns the fresh run read and the published data does not have (new models, or a parser reading more);
 * - guns the published data has and the fresh run did not read (a discontinued model, or a parser that
 *   has stopped working — the difference matters, and only a person can tell);
 * - guns whose figures changed, with both values side by side and the maker's own string for each.
 *
 * A changed figure is the serious one: the same gun, the same page, two different barrel lengths means
 * one of the two readings is wrong. Nothing is fetched and nothing is written; it reads two sets of files.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirearm, units, type Firearm } from '@gordons-legacy/formats';

/** One figure of a gun, as the comparison names it. */
type Figure = 'barrel length' | 'twist' | 'mass' | 'cartridge';

/** How much a figure may move before it is worth a person's time: a tenth of a millimetre, or a gram. */
const SAME = { length: 0.0001, mass: 0.001 };

/** The guns of a published maker file (`value` is a list) or of a folder an extractor wrote. */
export function read(path: string): Map<string, Firearm> {
  const guns = new Map<string, Firearm>();
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((name) => name.endsWith('.firearm.json'))
        .map((name) => readFileSync(join(path, name), 'utf8'))
    : (JSON.parse(readFileSync(path, 'utf8')) as { value: unknown[] }).value.map((gun) => JSON.stringify(gun));
  for (const text of files) {
    const result = parseFirearm(text);
    if (result.ok) guns.set(result.value.name, result.value);
  }
  return guns;
}

/** A length as a person reads it: millimetres, and the inches the maker probably printed. */
function millimetres(metres: number | undefined): string {
  return metres === undefined ? 'none' : `${(metres * 1000).toFixed(1)} mm`;
}

function grams(kilograms: number | undefined): string {
  return kilograms === undefined ? 'none' : `${(kilograms * 1000).toFixed(0)} g`;
}

/** What changed between two readings of one gun, in words; empty where nothing did. */
export function changes(before: Firearm, after: Firearm): string[] {
  const found: Array<{ figure: Figure; text: string }> = [];
  if ((before.cartridge ?? '') !== (after.cartridge ?? '')) {
    found.push({ figure: 'cartridge', text: `cartridge "${before.cartridge ?? 'none'}" → "${after.cartridge ?? 'none'}"` });
  }
  if (Math.abs(before.barrel.length - after.barrel.length) > SAME.length) {
    found.push({ figure: 'barrel length', text: `barrel ${millimetres(before.barrel.length)} → ${millimetres(after.barrel.length)}` });
  }
  const twists = [before.barrel.twistLength, after.barrel.twistLength];
  if (twists[0] !== twists[1] && Math.abs((twists[0] ?? 0) - (twists[1] ?? 0)) > SAME.length) {
    const inches = twists.map((twist) => (twist === undefined ? 'none' : `1:${(twist / units.INCH).toFixed(1)}"`));
    found.push({ figure: 'twist', text: `twist ${inches[0]} → ${inches[1]}` });
  }
  const masses = [before.barrel.gunMass, after.barrel.gunMass];
  if (masses[0] !== masses[1] && Math.abs((masses[0] ?? 0) - (masses[1] ?? 0)) > SAME.mass) {
    found.push({ figure: 'mass', text: `mass ${grams(masses[0])} → ${grams(masses[1])}` });
  }
  // The maker's own string says which of the two readings to believe, so it travels with the change.
  const printed = after.source?.kind === 'published' ? (after.source.published ?? {}) : {};
  const witness: Partial<Record<Figure, string | undefined>> = {
    'barrel length': printed['barrelLength'],
    twist: printed['twist'],
    mass: printed['weight'],
    cartridge: printed['caliber'],
  };
  return found.map(({ figure, text }) => {
    const string = witness[figure];
    return string === undefined ? text : `${text} (the page prints "${string}")`;
  });
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  const fresh = paths.pop();
  if (fresh === undefined || paths.length === 0) {
    console.error('usage: deno run -A tools/data/firearms/compare-corpus.ts <published maker file or folder>... <fresh folder>');
    process.exitCode = 1;
    return;
  }
  const before = new Map(paths.flatMap((path) => [...read(path)]));
  const after = read(fresh);
  const added = [...after.keys()].filter((name) => !before.has(name)).sort();
  const gone = [...before.keys()].filter((name) => !after.has(name)).sort();
  const changed = [...after]
    .filter(([name]) => before.has(name))
    .map(([name, gun]) => ({ name, lines: changes(before.get(name)!, gun) }))
    .filter(({ lines }) => lines.length > 0)
    .sort((one, other) => one.name.localeCompare(other.name));
  console.log(`${before.size} published, ${after.size} read again: ${added.length} new, ${gone.length} not read this time, ${changed.length} changed`);
  for (const name of added) console.log(`  new            ${name}`);
  for (const name of gone) console.log(`  not read       ${name}`);
  for (const { name, lines } of changed) console.log(`  changed        ${name}: ${lines.join('; ')}`);
  if (gone.length > 0) {
    console.log('\nA gun that was not read again is kept, not deleted: a discontinued gun is still owned and loaded for.');
    console.log('Check whether the pages are gone or the parser has stopped reading them — the counts do not say which.');
  }
}

if (import.meta.main) await main();
