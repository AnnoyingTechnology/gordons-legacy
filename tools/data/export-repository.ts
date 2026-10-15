/**
 * Writes the data repository's files (gordons-legacy-data) from the bundled community snapshot: one JSON
 * file per powder, projectile and caliber, each with its provenance, and index.json with every file's
 * SHA-256. Run with an official Node 24, then check with validate-repository.ts:
 *
 *     node tools/data/export-repository.ts <clone of gordons-legacy-data>
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, type ComponentKind, type DataIndexEntry, type Provenance } from '@gordons-legacy/data';

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

/** A path for each component, unique even when two share a name, author and date. */
function uniquePath(component: Component, used: Set<string>): string {
  const base = slug(component.name, component.source.author, component.source.date) || component.kind;
  let path = `${component.folder}/${base}.json`;
  for (let suffix = 2; used.has(path); suffix++) path = `${component.folder}/${base}-${suffix}.json`;
  used.add(path);
  return path;
}

async function main(): Promise<void> {
  const repository = process.argv[2];
  if (!repository) throw new Error('usage: export-repository.ts <repository folder>');
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
  files.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(repository, 'index.json'), `${JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files }, null, 1)}\n`);
  console.log(`${files.length} files → ${repository}`);
}

await main();
