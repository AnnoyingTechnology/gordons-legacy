import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { checkRepository } from '../../../tools/data/validate-repository.ts';

/**
 * The checker the data repository's CI runs on a clone (tools/data/validate-repository.ts). Whatever
 * `index.json` holds, the checker reports it; a broken index must fail the build with a reason, not
 * with a stack trace that says nothing of the repository.
 */
const repositories: string[] = [];

function repository(index: string | undefined): string {
  const folder = mkdtempSync(join(tmpdir(), 'gordons-legacy-data-'));
  repositories.push(folder);
  if (index !== undefined) writeFileSync(join(folder, 'index.json'), index);
  return folder;
}

afterEach(() => {
  for (const folder of repositories.splice(0)) rmSync(folder, { recursive: true, force: true });
});

test('an index that is null, not JSON or missing is reported as an invalid index', async () => {
  for (const index of ['null', '{"format": "gordons-legacy.data-index", "version": 1, "files": nul', undefined]) {
    expect(await checkRepository(repository(index))).toEqual({ listedFiles: 0, problems: [{ path: 'index.json', problem: 'invalid index' }] });
  }
});

test('an empty repository with a valid index has nothing to report', async () => {
  const folder = repository('{"format": "gordons-legacy.data-index", "version": 1, "files": []}');
  mkdirSync(join(folder, 'powders'));
  expect(await checkRepository(folder)).toEqual({ listedFiles: 0, problems: [] });
});
