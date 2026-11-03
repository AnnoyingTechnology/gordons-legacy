import { implausibleFigures } from './firearm-plausibility.ts';
import { isDataIndex } from './index-shape.ts';
import type { DataIndexEntry } from './repository.ts';
import { readDocument, sha256 } from './sync.ts';

/** A problem found in the data repository, with the file it concerns. */
export interface RepositoryProblem {
  path: string;
  problem: 'listed twice' | 'listed but missing' | 'hash differs' | 'invalid component' | 'not listed' | 'invalid index' | 'implausible figure';
  /** Which record and figure, where the file alone does not say: `Example Rifle: a barrel of 24000.0 mm is not a barrel`. */
  detail?: string;
}

/**
 * Checks the data repository's files against its index: every component file is listed once, every
 * listed file exists, its SHA-256 matches, it is a component the application reads, and every gun in it
 * has a barrel, a twist and a mass a gun can have (firearm-plausibility.ts).
 *
 * `index` is the parsed `index.json`, whatever it holds; `files` maps each component file's path
 * (`powders/….json`) to its text.
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

/** One listed file: present, with the hash the index gives, a valid component, and believable guns. */
async function checkListedFile(entry: DataIndexEntry, text: string | undefined): Promise<RepositoryProblem[]> {
  if (text === undefined) return [{ path: entry.path, problem: 'listed but missing' }];
  const problems: RepositoryProblem[] = [];
  if ((await sha256(text)) !== entry.sha256) problems.push({ path: entry.path, problem: 'hash differs' });
  const document = readDocument(text, entry);
  if (!document) return [...problems, { path: entry.path, problem: 'invalid component' }];
  // The load format accepts any positive barrel, as it must for a gun a user describes; a published
  // catalogue is held to what a gun can be, so a 24 m barrel read off a page never reaches a user.
  if (document.kind === 'firearm') {
    for (const firearm of document.value) {
      for (const detail of implausibleFigures(firearm)) problems.push({ path: entry.path, problem: 'implausible figure', detail: `${firearm.name}: ${detail}` });
    }
  }
  return problems;
}
