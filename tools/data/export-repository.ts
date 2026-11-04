/**
 * Writes the data repository's files (gordons-legacy-data) from the bundled community snapshot: one JSON
 * file per powder, projectile and caliber, each with its provenance, and index.json with every file's
 * SHA-256. Run it on an official Node 24, or with Deno where Node strips no types (the maintainer's,
 * which answers `ERR_UNKNOWN_FILE_EXTENSION`), then check the result with validate-repository.ts:
 *
 *     node tools/data/export-repository.ts <clone of gordons-legacy-data>
 *     deno run -A tools/data/export-repository.ts <clone> --firearms /tmp/guns-glock --firearms /tmp/guns-ruger
 *
 * `--firearms` adds the gun files an extractor wrote (tools/data/firearms/, docs/firearm-data.md) to the
 * repository, as one file per maker (`firearms/glock.json`) holding that maker's guns: the application
 * downloads a whole catalogue to search it, and 2,500 single files would be 2,500 requests. The
 * components are rewritten from the snapshot every run; guns **accumulate**, because a gun that has left
 * a catalogue is still owned and loaded for. A gun of the same name is replaced by the new reading.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, sha256, type ComponentKind, type DataIndexEntry, type Provenance } from '@gordons-legacy/data';
import { parseFirearm, type Firearm } from '@gordons-legacy/formats';
import { plainText } from './firearms/maker-site.ts';
import { settleListing } from './firearms/printed-figures.ts';

const SNAPSHOT = join(import.meta.dirname, '../../packages/app/src/data/community-components.json');
const GRAINS_PER_KILOGRAM = 15432.358;

interface Source {
  file: string;
  author: string;
  date: string;
}

interface Snapshot {
  source: string;
  commit: string;
  powders: Array<{ source: Source; propellant: { maker: string; product: string; lot: string } }>;
  projectiles: Array<{ source: Source; projectile: { name: string; mass: number } }>;
  calibers: Array<{ source: Source; caliber: { name: string } }>;
}

/** One file to write: its folder, a readable name for the file and the index, and its content. */
interface Component {
  kind: ComponentKind;
  folder: string;
  name: string;
  source: Source;
  value: unknown;
}

/** A file name from a component's names: lower case, ASCII, dashes. */
function slug(...parts: string[]): string {
  return parts
    .join('-')
    .normalize('NFKD')
    .replace(/[^\w.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function components(snapshot: Snapshot): Component[] {
  return [
    ...snapshot.powders.map(({ source, propellant }) => ({
      kind: 'powder' as const,
      folder: 'powders',
      name: `${propellant.maker} ${propellant.product} ${propellant.lot}`,
      source,
      value: propellant,
    })),
    ...snapshot.projectiles.map(({ source, projectile }) => ({
      kind: 'projectile' as const,
      folder: 'projectiles',
      name: `${projectile.name} ${(projectile.mass * GRAINS_PER_KILOGRAM).toFixed(0)}gr`,
      source,
      value: projectile,
    })),
    ...snapshot.calibers.map(({ source, caliber }) => ({ kind: 'caliber' as const, folder: 'calibers', name: caliber.name, source, value: caliber })),
  ];
}

/** The repository's file for a component: format, kind, provenance and values. */
function document(component: Component, snapshot: Snapshot): string {
  const provenance: Provenance = {
    origin: 'GRT community file (GRT Discord), CC0',
    source: `${snapshot.source} at ${snapshot.commit}`,
    file: component.source.file,
    author: component.source.author,
    date: component.source.date,
    method: 'shared GRT model, converted to SI',
    status: 'unverified',
  };
  return `${JSON.stringify({ format: 'gordons-legacy.component', version: 1, kind: component.kind, provenance, value: component.value }, null, 2)}\n`;
}

/**
 * How a gun file was made. The gun's own `source` says which page it came from, on what date, and what
 * its mass includes; this says what the repository says of every file. The maker published the figures
 * and did not license them: CC0 covers this compilation, not anyone else's rights.
 */
function firearmProvenance(guns: readonly Firearm[]): Provenance {
  const publisher = guns[0]?.source?.publisher ?? guns[0]?.maker ?? 'the maker';
  const url = guns[0]?.source?.url;
  const dates = guns.flatMap((gun) => (gun.source?.retrieved === undefined ? [] : [gun.source.retrieved])).sort();
  return {
    origin: `published by ${publisher}; facts, released in this repository under CC0`,
    source: url === undefined ? '' : new URL(url).origin,
    file: '',
    author: publisher,
    date: dates.at(-1) ?? '',
    method: "read from the maker's own specification pages",
    status: 'published specification, not measured',
  };
}

/** The gun files an extractor wrote (`*.firearm.json`), at any depth under `folder`. */
function firearmFiles(folder: string): Array<{ name: string; text: string }> {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.firearm.json'))
    .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }));
}

/**
 * The same figure without the noise a unit conversion leaves behind: a 1:14" twist comes out of
 * `14 * 0.0254` as 0.35559999999999997 metres, which is the same length written unreadably. Ten
 * significant digits keep every figure a maker publishes — a barrel measured to the micrometre needs
 * seven — and drop the binary remainder, so the published files read as the numbers they are.
 */
function tidyNumbers(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(10)) : value;
  if (Array.isArray(value)) return value.map(tidyNumbers);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, tidyNumbers(inner)]));
  return value;
}

/**
 * The gun records of `folders`, by maker, as the format reads them. A record the format rejects is
 * reported and left out, and so is a second record of a name a folder has already given: within one
 * reading of a catalogue, two guns of one name are a fault in the extractor — two pages read as one
 * gun — and the published file must not quietly keep whichever came last. Across folders, a later
 * folder is a newer reading and does replace what an earlier one gave.
 */
function readFirearms(folders: readonly string[]): Map<string, Map<string, Firearm>> {
  const byMaker = new Map<string, Map<string, Firearm>>();
  for (const folder of folders) {
    const read = new Map<string, Map<string, Firearm>>();
    for (const { name, text } of firearmFiles(folder)) {
      const result = parseFirearm(text);
      if (!result.ok) {
        const issues = result.issues.map((issue) => `${issue.path ?? '?'}: ${issue.message}`).join('; ');
        console.log(`  ${name} left out — ${issues}`);
        continue;
      }
      const firearm = tidyNumbers(result.value) as Firearm;
      const maker = slug(firearm.maker ?? firearm.source?.publisher ?? 'unknown');
      const guns = read.get(maker) ?? new Map<string, Firearm>();
      if (guns.has(firearm.name)) {
        console.log(`  ${name} left out — another file of this folder already holds a gun called "${firearm.name}"`);
        continue;
      }
      guns.set(firearm.name, firearm);
      read.set(maker, guns);
    }
    for (const [maker, guns] of read) {
      const known = byMaker.get(maker) ?? new Map<string, Firearm>();
      for (const [name, firearm] of guns) known.set(name, firearm);
      byMaker.set(maker, known);
    }
  }
  return byMaker;
}

/**
 * The guns a maker's published file holds, so that a new reading of a catalogue does not drop them;
 * none when there is no file yet (`text` undefined).
 *
 * A file that is there but does not read as a gun file — broken JSON, a gun the format has since come
 * to reject, another kind — stops the export. Taking it for an empty catalogue would replace every gun
 * it publishes with the new reading alone, and guns that have left a catalogue are still owned and
 * loaded for; they are the ones no new reading can bring back.
 */
export function publishedFirearms(path: string, text: string | undefined): Firearm[] {
  if (text === undefined) return [];
  const document = readDocument(text);
  if (document?.kind !== 'firearm') {
    throw new Error(`${path} is there but is not a gun file this version reads; the export stops rather than replace its published guns with the new reading alone. Repair the file (git history has the last good one) and run the export again.`);
  }
  return document.value;
}

/** The guns a maker's file already holds in the repository (`publishedFirearms`). */
function existingFirearms(repository: string, maker: string): Firearm[] {
  const path = `firearms/${maker}.json`;
  const file = join(repository, path);
  return publishedFirearms(path, existsSync(file) ? readFileSync(file, 'utf8') : undefined);
}

/**
 * A name as a comparison: the trademark marks, the entities a page escaped and the punctuation left
 * out. `Bergara BA13 TAKE DOWN SYNTHETIC CAMO STRATA® .223 Rem.` and `Bergara B14 Sporter 6.5&#215;55
 * SE` are how two of them were published before the extractors shared one reader of a page's text.
 */
export function comparableName(name: string): string {
  return plainText(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The figures a gun is the same gun by, for the comparison below. */
function figures(gun: Firearm): string {
  return JSON.stringify([gun.source?.url, gun.barrel.length, gun.barrel.twistLength, gun.barrel.gunMass]);
}

/**
 * The published guns a new reading supersedes: the same page, the same figures, and the same name once
 * the marks and the escapes are out of it. Guns accumulate, because a gun that has left a catalogue is
 * still owned and loaded for — but a gun whose **name** we read better is not a second gun, and keeping
 * both would offer the user `STRATA®` and `STRATA` as two rifles.
 */
export function supersededNames(published: readonly Firearm[], read: ReadonlyMap<string, Firearm>): Set<string> {
  const fresh = new Map([...read.values()].map((gun) => [`${comparableName(gun.name)} ${figures(gun)}`, gun.name]));
  const superseded = new Set<string>();
  for (const gun of published) {
    const renamed = fresh.get(`${comparableName(gun.name)} ${figures(gun)}`);
    if (renamed !== undefined && renamed !== gun.name) superseded.add(gun.name);
  }
  return superseded;
}

/** One maker's file of the gun database, ready to write: its path, its text, and the maker's name. */
interface MakerFile {
  path: string;
  text: string;
  name: string;
}

/**
 * A gun read again under a name already published. The new reading replaces the published gun — a
 * catalogue corrects its figures, and of two listings of one gun the heaviest is kept (settleListing,
 * the maintainer's rule of 2026-11-03) — except where it is no correction:
 *  - another cartridge under the name is another gun (a maker reused the name): the published gun stays
 *    and the new one is added, its cartridge in its name;
 *  - a reading that only lost figures the page no longer prints, every other figure the same, keeps the
 *    published gun: a page going quiet contradicts nothing.
 */
export function mergedReading(published: Firearm | undefined, fresh: Firearm): Firearm[] {
  if (published === undefined) return [fresh];
  if (published.cartridge !== fresh.cartridge) {
    const name = `${fresh.name} ${fresh.cartridge}`;
    return [published, { ...fresh, name, barrel: { ...fresh.barrel, name } }];
  }
  const pairs = [
    [published.barrel.length, fresh.barrel.length],
    [published.barrel.twistLength, fresh.barrel.twistLength],
    [published.barrel.gunMass, fresh.barrel.gunMass],
  ] as const;
  const onlyLost = pairs.every(([before, after]) => after === undefined || after === before) && pairs.some(([before, after]) => before !== undefined && after === undefined);
  return [onlyLost ? published : fresh];
}

/**
 * A maker's published guns with a new reading merged in, by name (`mergedReading`). A gun renamed apart
 * (another cartridge) meets the published guns by the listing rules, so that it never overwrites
 * another configuration published under the name it takes (#30 review).
 */
export function mergedCatalogue(published: readonly Firearm[], fresh: ReadonlyMap<string, Firearm>): Map<string, Firearm> {
  const guns = new Map(published.map((gun) => [gun.name, gun]));
  for (const [name, gun] of fresh) {
    for (const kept of mergedReading(guns.get(name), gun)) {
      if (kept.name === name) {
        guns.set(name, kept);
        continue;
      }
      const settled = settleListing(guns, kept, (firearm) => firearm.name);
      if ('write' in settled) guns.set(settled.write.name, settled.write);
    }
  }
  return guns;
}

/**
 * The gun database: one file per maker, holding that maker's guns by name, with the guns the repository
 * already holds kept where the new reading no longer has them — a gun that has left a catalogue is
 * still owned and loaded for. Nothing is written here, so that a published file which does not read
 * (`publishedFirearms`) stops the export before any file of the repository has changed.
 */
function makerFiles(repository: string, folders: readonly string[]): MakerFile[] {
  const read = readFirearms(folders);
  const makers = new Set([...read.keys(), ...(existsSync(join(repository, 'firearms')) ? readdirSync(join(repository, 'firearms')).map((name) => name.replace(/\.json$/, '')) : [])]);
  const files: MakerFile[] = [];
  for (const maker of [...makers].sort()) {
    const published = existingFirearms(repository, maker);
    const fresh = read.get(maker) ?? new Map<string, Firearm>();
    const superseded = supersededNames(published, fresh);
    if (superseded.size > 0) console.log(`  firearms/${maker}.json: ${superseded.size} guns published under a name since read better`);
    const guns = mergedCatalogue(published.filter((gun) => !superseded.has(gun.name)), fresh);
    const value = [...guns.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (value.length === 0) continue;
    const document = { format: 'gordons-legacy.component', version: 1, kind: 'firearm', provenance: firearmProvenance(value), value };
    files.push({ path: `firearms/${maker}.json`, text: `${JSON.stringify(document, null, 2)}\n`, name: value[0]!.maker ?? maker });
  }
  return files;
}

/** Writes the gun database's files and returns their index entries. */
async function writeMakerFiles(repository: string, files: readonly MakerFile[]): Promise<DataIndexEntry[]> {
  if (files.length > 0) mkdirSync(join(repository, 'firearms'), { recursive: true });
  const entries: DataIndexEntry[] = [];
  for (const { path, text, name } of files) {
    writeFileSync(join(repository, path), text);
    entries.push({ path, kind: 'firearm', name, sha256: await sha256(text) });
  }
  return entries;
}

/** A path for each component, unique even when two share a name, author and date. */
function uniquePath(component: Component, used: Set<string>): string {
  const base = slug(component.name, component.source.author, component.source.date) || component.kind;
  let path = `${component.folder}/${base}.json`;
  for (let suffix = 2; used.has(path); suffix++) path = `${component.folder}/${base}-${suffix}.json`;
  used.add(path);
  return path;
}

/** The repository to write, and the folders of gun files to add to it. */
function commandLine(argv: readonly string[]): { repository: string; firearmFolders: string[] } {
  const firearmFolders: string[] = [];
  const plain: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--firearms') firearmFolders.push(argv[++index] ?? '');
    else plain.push(argv[index]!);
  }
  const repository = plain[0];
  if (!repository || firearmFolders.includes('')) {
    throw new Error('usage: export-repository.ts <repository folder> [--firearms <folder of .firearm.json>]...');
  }
  return { repository, firearmFolders };
}

async function main(): Promise<void> {
  const { repository, firearmFolders } = commandLine(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
  // The guns first: everything that can stop the export is read before any file is removed or written.
  const guns = makerFiles(repository, firearmFolders);
  for (const folder of ['powders', 'projectiles', 'calibers']) {
    rmSync(join(repository, folder), { recursive: true, force: true });
    mkdirSync(join(repository, folder), { recursive: true });
  }
  const used = new Set<string>();
  const files: DataIndexEntry[] = [];
  for (const component of components(snapshot)) {
    const path = uniquePath(component, used);
    const text = document(component, snapshot);
    writeFileSync(join(repository, path), text);
    files.push({ path, kind: component.kind, name: component.name, sha256: await sha256(text) });
  }
  const firearmEntries = await writeMakerFiles(repository, guns);
  files.push(...firearmEntries);
  files.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(repository, 'index.json'), `${JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files }, null, 1)}\n`);
  console.log(`${files.length} files → ${repository}${firearmEntries.length === 0 ? '' : ` (${firearmEntries.length} makers' guns)`}`);
}

/**
 * Only when this file is the program, so that a test can import the rules above. `import.meta.main` is
 * the Deno and Node 24 answer; the file name is the fallback, because a runner that leaves it undefined
 * would otherwise turn the export into a silent no-op.
 */
if (import.meta.main ?? (process.argv[1] ?? '').endsWith('export-repository.ts')) await main();
