import { expect, test } from 'vitest';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
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

/** One maker's file of the gun database, holding the guns given, and an index listing it. */
async function makerFile(guns: Firearm[]): Promise<{ index: DataIndex; files: Map<string, string> }> {
  const text = JSON.stringify({ format: 'gordons-legacy.component', version: 1, kind: 'firearm', provenance, value: guns });
  const entry = { path: 'firearms/example-arms.json', kind: 'firearm' as const, name: 'Example Arms', sha256: await sha256(text) };
  return { index: { format: 'gordons-legacy.data-index', version: 1, files: [entry] }, files: new Map([[entry.path, text]]) };
}

function rifle(name: string, barrel: Partial<Firearm['barrel']>): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    cartridge: '.308 Win.',
    barrel: { name, length: 0.61, twistLength: 0.254, gunMass: 3.6, gasLeaks: [], ...barrel },
  };
}

test('a published gun with a figure no gun has is refused: a 24 m barrel, a 4,535 kg rifle, a 5 m twist', async () => {
  const believable = await makerFile([rifle('Example Rifle 24"', {})]);
  expect(await validateRepository(believable.index, believable.files)).toEqual([]);

  // The load format takes any positive length, so only the plausibility check stands between a unit
  // mix-up on a maker's page (24" read as 24 m) and the published catalogue.
  const { index, files } = await makerFile([rifle('Example Rifle', { length: 24 }), rifle('Example Heavy', { gunMass: 4535, twistLength: 5 })]);
  expect(await validateRepository(index, files)).toEqual([
    { path: 'firearms/example-arms.json', problem: 'implausible figure', detail: 'Example Rifle: a barrel of 24000.0 mm is not a barrel' },
    { path: 'firearms/example-arms.json', problem: 'implausible figure', detail: 'Example Heavy: a gun of 4535.000 kg is not a gun' },
    { path: 'firearms/example-arms.json', problem: 'implausible figure', detail: 'Example Heavy: a turn of 5000.0 mm is not a twist' },
  ]);
});
