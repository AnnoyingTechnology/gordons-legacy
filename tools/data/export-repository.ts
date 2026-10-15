/**
 * Writes the data repository's files (gordons-legacy-data) from the bundled community snapshot: one JSON
 * file per powder, projectile and caliber, each with its provenance, and index.json with every file's
 * SHA-256. Run with an official Node 24, then check with validate-repository.ts:
 *
 *     node tools/data/export-repository.ts <clone of gordons-legacy-data>
 *     node tools/data/export-repository.ts <clone> --firearms /tmp/guns-glock --firearms /tmp/guns-ruger
 *
 * `--firearms` adds the gun files an extractor wrote (tools/data/firearms/, docs/firearm-data.md) to the
 * `firearms/` folder of the repository. The components are rewritten from the snapshot every run; guns
 * **accumulate**, because a gun that has left a catalogue is still owned and loaded for. A gun whose
 * file already exists is replaced by the new reading; the others stay where they are.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, sha256, type ComponentKind, type DataIndexEntry, type Provenance } from '@gordons-legacy/data';
import { parseFirearm, type Firearm } from '@gordons-legacy/formats';

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
function firearmProvenance(firearm: Firearm, file: string): Provenance {
  const publisher = firearm.source?.publisher ?? firearm.maker ?? 'the maker';
  return {
    origin: `published by ${publisher}; facts, released in this repository under CC0`,
    source: firearm.source?.url ?? '',
    file,
    author: publisher,
    date: firearm.source?.retrieved ?? '',
    method: "read from the maker's own specification page",
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
 * Writes the gun database: the records of `folders` as component files, keeping the guns the repository
 * already holds. Returns their index entries. A record the format rejects is reported and left out.
 */
async function writeFirearms(repository: string, folders: readonly string[]): Promise<DataIndexEntry[]> {
  const guns = new Map<string, { text: string; name: string }>();
  for (const folder of folders) {
    for (const { name, text } of firearmFiles(folder)) {
      const result = parseFirearm(text);
      if (!result.ok) {
        const issues = result.issues.map((issue) => `${issue.path ?? '?'}: ${issue.message}`).join('; ');
        console.log(`  ${name} left out — ${issues}`);
        continue;
      }
      const firearm = result.value;
      const document = { format: 'gordons-legacy.component', version: 1, kind: 'firearm', provenance: firearmProvenance(firearm, name), value: firearm };
      guns.set(`firearms/${slug(firearm.name)}.json`, { text: `${JSON.stringify(document, null, 2)}\n`, name: firearm.name });
    }
  }
  const existing = join(repository, 'firearms');
  if (existsSync(existing)) {
    for (const name of readdirSync(existing)) {
      const path = `firearms/${name}`;
      if (!name.endsWith('.json') || guns.has(path)) continue;
      const text = readFileSync(join(existing, name), 'utf8');
      const document = readDocument(text);
      if (document?.kind !== 'firearm') {
        console.log(`  ${path}: kept as it is, but it is not a gun file this version reads`);
        continue;
      }
      guns.set(path, { text, name: document.value.name });
    }
  }
  if (guns.size === 0) return [];
  mkdirSync(existing, { recursive: true });
  const entries: DataIndexEntry[] = [];
  for (const [path, { text, name }] of guns) {
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
  const guns = await writeFirearms(repository, firearmFolders);
  files.push(...guns);
  files.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(repository, 'index.json'), `${JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files }, null, 1)}\n`);
  console.log(`${files.length} files → ${repository}${guns.length === 0 ? '' : ` (${guns.length} guns)`}`);
}

await main();
