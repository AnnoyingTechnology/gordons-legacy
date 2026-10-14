// Writes the data repository's files (gordons-legacy-data) from the community snapshot: one JSON file
// per powder, projectile and caliber, each with its provenance, and index.json listing every file with
// its SHA-256. Run with an official Node 24:
//   node tools/data/export-repository.ts <path to a clone of gordons-legacy-data>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argument = process.argv[2];
if (!argument) throw new Error('usage: export-repository.ts <repository folder>');
const target: string = argument;
const snapshot = JSON.parse(readFileSync(join(import.meta.dirname, '../../packages/app/src/data/community-components.json'), 'utf8')) as {
  source: string;
  commit: string;
  powders: Array<{ source: Source; propellant: { maker: string; product: string; lot: string } }>;
  projectiles: Array<{ source: Source; projectile: { name: string; mass: number } }>;
  calibers: Array<{ source: Source; caliber: { name: string } }>;
};
interface Source {
  file: string;
  author: string;
  date: string;
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

const index: Array<{ path: string; kind: string; name: string; sha256: string }> = [];
const used = new Set<string>();

function write(kind: 'powder' | 'projectile' | 'caliber', folder: string, name: string, source: Source, value: unknown): void {
  let base = slug(name, source.author, source.date) || kind;
  for (let suffix = 2; used.has(`${folder}/${base}`); suffix++) base = `${slug(name, source.author, source.date)}-${suffix}`;
  used.add(`${folder}/${base}`);
  const path = `${folder}/${base}.json`;
  const document = {
    format: 'gordons-legacy.component',
    version: 1,
    kind,
    provenance: {
      origin: 'GRT community file (GRT Discord), CC0',
      source: `${snapshot.source} at ${snapshot.commit}`,
      file: source.file,
      author: source.author,
      date: source.date,
      method: 'shared GRT model, converted to SI',
      status: 'unverified',
    },
    value,
  };
  const text = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(join(target, path), text);
  index.push({ path, kind, name, sha256: createHash('sha256').update(text).digest('hex') });
}

for (const folder of ['powders', 'projectiles', 'calibers']) {
  rmSync(join(target, folder), { recursive: true, force: true });
  mkdirSync(join(target, folder), { recursive: true });
}
for (const { source, propellant } of snapshot.powders) write('powder', 'powders', `${propellant.maker} ${propellant.product} ${propellant.lot}`, source, propellant);
for (const { source, projectile } of snapshot.projectiles) write('projectile', 'projectiles', `${projectile.name} ${(projectile.mass * 15432.358).toFixed(0)}gr`, source, projectile);
for (const { source, caliber } of snapshot.calibers) write('caliber', 'calibers', caliber.name, source, caliber);
index.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(target, 'index.json'), `${JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files: index }, null, 1)}\n`);
console.log(`${index.length} files → ${target}`);
