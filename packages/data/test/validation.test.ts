import { expect, test } from 'vitest';
import { sha256, validateRepository, type DataIndex } from '../src/index.ts';

const provenance = { origin: 'test', source: 'test', file: '', author: '', date: '', method: 'test', status: 'unverified' };
/** A projectile file the application reads. */
const projectile = JSON.stringify({
  format: 'gordons-legacy.component',
  version: 1,
  kind: 'projectile',
  provenance,
  value: { name: 'Test', maker: 'Test', product: 'Test', lot: '', diameter: 0.00782, mass: 0.00713, length: 0.0234, base: { shape: 'flat' }, shotStartPressure: 25e6, ubcsCode: '' },
});

async function index(paths: string[], text = projectile): Promise<DataIndex> {
  const hash = await sha256(text);
  return { format: 'gordons-legacy.data-index', version: 1, files: paths.map((path) => ({ path, kind: 'projectile', name: path, sha256: hash })) };
}

test('a consistent repository has no problem', async () => {
  expect(await validateRepository(await index(['projectiles/a.json']), new Map([['projectiles/a.json', projectile]]))).toEqual([]);
});

test('malformed JSON shapes are reported instead of throwing during validation', async () => {
  const valid = await index(['projectiles/a.json']);
  for (const value of [null, {}, { ...valid, files: null }, { ...valid, files: [null] },
    { ...valid, files: [{ ...valid.files[0], sha256: 'invalid' }] }]) {
    expect(await validateRepository(value, new Map())).toEqual([{ path: 'index.json', problem: 'invalid index' }]);
  }
  expect(await validateRepository(await index(['projectiles/a.json'], 'null'), new Map([['projectiles/a.json', 'null']]))).toEqual([
    { path: 'projectiles/a.json', problem: 'invalid component' },
  ]);
});

test('unlisted, missing and duplicated files are reported', async () => {
  const problems = await validateRepository(
    await index(['projectiles/a.json', 'projectiles/a.json', 'projectiles/gone.json']),
    new Map([['projectiles/a.json', projectile], ['projectiles/stray.json', projectile]]),
  );
  expect(problems).toEqual([
    { path: 'projectiles/a.json', problem: 'listed twice' },
    { path: 'projectiles/gone.json', problem: 'listed but missing' },
    { path: 'projectiles/stray.json', problem: 'not listed' },
  ]);
});

test('a changed file fails its hash; an impossible value fails the component check', async () => {
  const changed = projectile.replace('0.00713', '0.00714');
  expect(await validateRepository(await index(['projectiles/a.json']), new Map([['projectiles/a.json', changed]]))).toEqual([
    { path: 'projectiles/a.json', problem: 'hash differs' },
  ]);
  const impossible = projectile.replace('0.00713', '-1');
  expect(await validateRepository(await index(['projectiles/a.json'], impossible), new Map([['projectiles/a.json', impossible]]))).toEqual([
    { path: 'projectiles/a.json', problem: 'invalid component' },
  ]);
});
