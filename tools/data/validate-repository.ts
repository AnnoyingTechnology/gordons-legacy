/**
 * Checks a clone of the data repository (gordons-legacy-data) and exits with status 1 if anything is
 * wrong. The checks themselves are `validateRepository` in @gordons-legacy/data; this reads the files.
 * Run by the data repository's CI, and by hand:
 *
 *     node tools/data/validate-repository.ts <repository folder>      # as the CI runs it, on Node 24
 *     deno run -A tools/data/validate-repository.ts <folder>          # where Node strips no types
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRepository, type DataIndex } from '@gordons-legacy/data';

/** The folders that hold component files; a repository need not have them all yet. */
const COMPONENT_FOLDERS = ['powders', 'projectiles', 'calibers', 'firearms'];

/** Every component file of the repository, by its path from the repository's root. */
function readComponentFiles(repository: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const folder of COMPONENT_FOLDERS) {
    if (!existsSync(join(repository, folder))) continue;
    for (const name of readdirSync(join(repository, folder))) {
      if (name.endsWith('.json')) files.set(`${folder}/${name}`, readFileSync(join(repository, folder, name), 'utf8'));
    }
  }
  return files;
}

async function main(): Promise<void> {
  const repository = process.argv[2];
  if (!repository) throw new Error('usage: validate-repository.ts <repository folder>');
  const index = JSON.parse(readFileSync(join(repository, 'index.json'), 'utf8')) as DataIndex;
  const problems = await validateRepository(index, readComponentFiles(repository));
  console.log(`${index.files.length} files checked, ${problems.length} problems`);
  for (const { path, problem } of problems) console.log(`  ${path}: ${problem}`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}

await main();
