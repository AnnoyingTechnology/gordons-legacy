import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, 'fixtures');

/** Reads a fixture file, given its path relative to `test/fixtures`. */
export function readFixture(relativePath: string): string {
  return readFileSync(join(FIXTURES, relativePath), 'utf8');
}

/** Lists the fixture files with the given extension, as paths relative to `test/fixtures`. */
export function listFixtures(extension: string): string[] {
  return readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith(extension))
    .sort();
}
