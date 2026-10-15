// Checks a clone of the data repository (gordons-legacy-data): index.json lists every component file and
// only those, each file's SHA-256 matches, and each file is a component the app reads (format, provenance,
// values checked like a saved load's). Exits with status 1 on any problem. Run by the data repository's
// CI, and by hand:
//   node tools/data/validate-repository.ts <repository folder>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, sha256, type DataIndex } from '@gordons-legacy/data';

const folder = process.argv[2];
if (!folder) throw new Error('usage: validate-repository.ts <repository folder>');

const problems: string[] = [];
const index = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')) as DataIndex;
if (index.format !== 'gordons-legacy.data-index' || index.version !== 1) problems.push('index.json: not a data index of version 1');

const onDisk = new Set(
  ['powders', 'projectiles', 'calibers'].flatMap((kind) =>
    readdirSync(join(folder, kind)).filter((name) => name.endsWith('.json')).map((name) => `${kind}/${name}`),
  ),
);
const listed = new Set<string>();
for (const entry of index.files) {
  if (listed.has(entry.path)) problems.push(`${entry.path}: listed twice`);
  listed.add(entry.path);
  if (!onDisk.has(entry.path)) {
    problems.push(`${entry.path}: listed but missing`);
    continue;
  }
  const text = readFileSync(join(folder, entry.path), 'utf8');
  if ((await sha256(text)) !== entry.sha256) problems.push(`${entry.path}: SHA-256 differs from index.json`);
  if (!readDocument(text, entry)) problems.push(`${entry.path}: not a valid ${entry.kind} file`);
}
for (const path of onDisk) if (!listed.has(path)) problems.push(`${path}: not listed in index.json`);

console.log(`${index.files.length} files checked, ${problems.length} problems`);
for (const problem of problems) console.log(`  ${problem}`);
process.exitCode = problems.length > 0 ? 1 : 0;
