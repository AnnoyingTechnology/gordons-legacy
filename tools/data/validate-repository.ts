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
import { validateRepository, type RepositoryProblem } from '@gordons-legacy/data';

/**
 * The folders that hold component files, at any depth (GRT's catalogue is `grt/powders/…`); a repository
 * need not have them all yet.
 */
const COMPONENT_FOLDERS = ['powders', 'projectiles', 'calibers', 'firearms', 'grt'];

/** Every component file of the repository, by its path from the repository's root. */
function readComponentFiles(repository: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const folder of COMPONENT_FOLDERS) {
    if (!existsSync(join(repository, folder))) continue;
    for (const name of readdirSync(join(repository, folder), { recursive: true, encoding: 'utf8' })) {
      if (name.endsWith('.json')) files.set(`${folder}/${name.split('\\').join('/')}`, readFileSync(join(repository, folder, name), 'utf8'));
    }
  }
  return files;
}

/**
 * `index.json` as JSON, whatever it holds, or `undefined` when it is missing or no JSON at all. Its
 * shape is `validateRepository`'s question, not this one's: a `null`, a list or a broken file is an
 * invalid index to report, never a crash of the checker that should have reported it.
 */
function readIndex(repository: string): unknown {
  try {
    return JSON.parse(readFileSync(join(repository, 'index.json'), 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** The repository's problems, and how many files its index lists (none when there is no usable index). */
export async function checkRepository(repository: string): Promise<{ listedFiles: number; problems: RepositoryProblem[] }> {
  const index = readIndex(repository);
  const problems = await validateRepository(index, readComponentFiles(repository));
  const files = (index as { files?: unknown } | null | undefined)?.files;
  return { listedFiles: Array.isArray(files) ? files.length : 0, problems };
}

async function main(): Promise<void> {
  const repository = process.argv[2];
  if (!repository) throw new Error('usage: validate-repository.ts <repository folder>');
  const { listedFiles, problems } = await checkRepository(repository);
  console.log(`${listedFiles} files checked, ${problems.length} problems`);
  for (const { path, problem, detail } of problems) console.log(`  ${path}: ${problem}${detail === undefined ? '' : ` (${detail})`}`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}

/**
 * Only when this file is the program, so that a test can import `checkRepository`. The file name is the
 * fallback for a runner that leaves `import.meta.main` undefined, as in export-repository.ts.
 */
if (import.meta.main ?? (process.argv[1] ?? '').endsWith('validate-repository.ts')) await main();
