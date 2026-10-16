import { isDataIndex } from './index-shape.ts';
import type { DataIndexEntry } from './repository.ts';
import { readDocument, sha256 } from './sync.ts';

/** A problem found in the data repository, with the file it concerns. */
export interface RepositoryProblem {
  path: string;
  problem: 'listed twice' | 'listed but missing' | 'hash differs' | 'invalid component' | 'not listed' | 'invalid index';
}

/**
 * Checks the data repository's files against its index: every component file is listed once, every
 * listed file exists, its SHA-256 matches, and it is a component the application reads.
 *
 * `files` maps each component file's path (`powders/….json`) to its text.
 */
export async function validateRepository(index: unknown, files: ReadonlyMap<string, string>): Promise<RepositoryProblem[]> {
  if (!isDataIndex(index)) {
    return [{ path: 'index.json', problem: 'invalid index' }];
  }
  const problems: RepositoryProblem[] = [];
  const listed = new Set<string>();
  for (const entry of index.files) {
    if (listed.has(entry.path)) problems.push({ path: entry.path, problem: 'listed twice' });
    listed.add(entry.path);
    problems.push(...(await checkListedFile(entry, files.get(entry.path))));
  }
  for (const path of files.keys()) {
    if (!listed.has(path)) problems.push({ path, problem: 'not listed' });
  }
  return problems;
}

/** One listed file: present, with the hash the index gives, and a valid component. */
async function checkListedFile(entry: DataIndexEntry, text: string | undefined): Promise<RepositoryProblem[]> {
  if (text === undefined) return [{ path: entry.path, problem: 'listed but missing' }];
  const problems: RepositoryProblem[] = [];
  if ((await sha256(text)) !== entry.sha256) problems.push({ path: entry.path, problem: 'hash differs' });
  if (!readDocument(text, entry)) problems.push({ path: entry.path, problem: 'invalid component' });
  return problems;
}
