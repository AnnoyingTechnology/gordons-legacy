/**
 * Writes the data repository's files (gordons-legacy-data) from the bundled community snapshot: one JSON
 * file per powder, projectile and caliber, each with its provenance, and index.json with every file's
 * SHA-256. Run it on an official Node 24, or with Deno where Node strips no types (the maintainer's,
 * which answers `ERR_UNKNOWN_FILE_EXTENSION`), then check the result with validate-repository.ts:
 *
 *     node tools/data/export-repository.ts <clone of gordons-legacy-data>
 *     deno run -A tools/data/export-repository.ts <clone> --firearms /tmp/guns-glock --firearms /tmp/guns-ruger
 *
 * GRT's catalogue (issue #19) is written as build-grt-catalogue.ts made it, from the copy bundled with the
 * app: one document per maker under `grt/`, rewritten every run like the community's components.
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
import { tidyNumbers } from './tidy-numbers.ts';

const SNAPSHOT = join(import.meta.dirname, '../../packages/app/src/data/community-components.json');
const GRT_CATALOGUE = join(import.meta.dirname, '../../packages/app/src/data/grt-catalogue.json');
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

/** The guns a maker's file already holds, so that a new reading of a catalogue does not drop them. */
function existingFirearms(repository: string, maker: string): Firearm[] {
  const path = join(repository, 'firearms', `${maker}.json`);
  if (!existsSync(path)) return [];
  const document = readDocument(readFileSync(path, 'utf8'));
  if (document?.kind !== 'firearm') {
    console.log(`  firearms/${maker}.json: not a gun file this version reads; it is left as it is`);
    return [];
  }
  return document.value;
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
 * Writes the gun database: one file per maker, holding that maker's guns by name, with the guns the
 * repository already holds kept where the new reading no longer has them — a gun that has left a
 * catalogue is still owned and loaded for. Returns the index entries.
 */
async function writeFirearms(repository: string, folders: readonly string[]): Promise<DataIndexEntry[]> {
  const read = readFirearms(folders);
  const makers = new Set([...read.keys(), ...(existsSync(join(repository, 'firearms')) ? readdirSync(join(repository, 'firearms')).map((name) => name.replace(/\.json$/, '')) : [])]);
  if (makers.size === 0) return [];
  mkdirSync(join(repository, 'firearms'), { recursive: true });
  const entries: DataIndexEntry[] = [];
  for (const maker of [...makers].sort()) {
    const published = existingFirearms(repository, maker);
    const fresh = read.get(maker) ?? new Map<string, Firearm>();
    const superseded = supersededNames(published, fresh);
    if (superseded.size > 0) console.log(`  firearms/${maker}.json: ${superseded.size} guns published under a name since read better`);
    const guns = mergedCatalogue(published.filter((gun) => !superseded.has(gun.name)), fresh);
    const value = [...guns.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (value.length === 0) continue;
    const document = { format: 'gordons-legacy.component', version: 1, kind: 'firearm', provenance: firearmProvenance(value), value };
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const path = `firearms/${maker}.json`;
    writeFileSync(join(repository, path), text);
    entries.push({ path, kind: 'firearm', name: value[0]!.maker ?? maker, sha256: await sha256(text) });
  }
  return entries;
}

/**
 * Writes GRT's catalogue: the documents build-grt-catalogue.ts made, each checked as the application
 * will read it. A document the format rejects stops the export: the catalogue is published whole.
 */
async function writeGrtCatalogue(repository: string): Promise<DataIndexEntry[]> {
  const documents = JSON.parse(readFileSync(GRT_CATALOGUE, 'utf8')) as Array<{ path: string; name: string; document: { kind: ComponentKind } }>;
  rmSync(join(repository, 'grt'), { recursive: true, force: true });
  const entries: DataIndexEntry[] = [];
  for (const { path, name, document } of documents) {
    const text = `${JSON.stringify(document, null, 1)}\n`;
    if (readDocument(text) === undefined) throw new Error(`${path}: not a document this version reads`);
    mkdirSync(join(repository, path, '..'), { recursive: true });
    writeFileSync(join(repository, path), text);
    entries.push({ path, kind: document.kind, name, sha256: await sha256(text) });
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
  const grtFiles = await writeGrtCatalogue(repository);
  files.push(...grtFiles);
  const makerFiles = await writeFirearms(repository, firearmFolders);
  files.push(...makerFiles);
  files.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(repository, 'index.json'), `${JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files }, null, 1)}\n`);
  console.log(`${files.length} files → ${repository} (${grtFiles.length} of GRT's catalogue${makerFiles.length === 0 ? '' : `, ${makerFiles.length} makers' guns`})`);
}

/**
 * Only when this file is the program, so that a test can import the rules above. `import.meta.main` is
 * the Deno and Node 24 answer; the file name is the fallback, because a runner that leaves it undefined
 * would otherwise turn the export into a silent no-op.
 */
if (import.meta.main ?? (process.argv[1] ?? '').endsWith('export-repository.ts')) await main();
