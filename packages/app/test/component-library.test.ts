import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { communityComponents, ComponentLibrary, type ComponentEntry } from '../src/state/components.ts';
import { memoryStore } from '../src/state/indexed-db.ts';

test('the community snapshot gives 12 powders, 393 projectiles and 48 calibers, each with its author', () => {
  const entries = communityComponents();
  expect(entries.filter((entry) => entry.kind === 'propellant')).toHaveLength(12);
  expect(entries.filter((entry) => entry.kind === 'projectile')).toHaveLength(393);
  expect(entries.filter((entry) => entry.kind === 'caliber')).toHaveLength(48);
  const redDot = entries.find((entry) => entry.kind === 'propellant' && entry.value.product.includes('Red Dot'))!;
  expect(redDot.source).toMatchObject({ origin: 'community', author: 'Tom24', date: '2023-06-21' });
});

test("a user's powder file is kept and comes back after a restart; the community's can't be removed", async () => {
  const storage = memoryStore<ComponentEntry>();
  const library = new ComponentLibrary(storage, []);
  await library.ready;
  const text = readFileSync(new URL('../../formats/test/fixtures/cc0/powders/Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant', import.meta.url), 'utf8');
  expect(await library.importFile('Red Dot.propellant', text)).toEqual([]);
  const reopened = new ComponentLibrary(storage, communityComponents());
  await reopened.ready;
  const mine = reopened.powders().filter((entry) => entry.source.origin === 'user');
  expect(mine).toHaveLength(1);
  const community = reopened.powders().find((entry) => entry.source.origin === 'community')!;
  await reopened.remove(community.id);
  expect(reopened.powders()).toHaveLength(13);
});

test('a file of another kind is refused with a message', async () => {
  const library = new ComponentLibrary(memoryStore<ComponentEntry>(), []);
  expect(await library.importFile('load.grtload', '<x/>')).toHaveLength(1);
});

/**
 * A record of a kind this version does not know — one written by a later version, or damaged — used to
 * fall through to the projectile check and be read as something it never was (#32). It is left out, and
 * the components beside it are not lost with it.
 */
test('a stored component of an unknown kind is left out, and the rest still arrive', async () => {
  const storage = memoryStore<ComponentEntry>();
  const projectile = communityComponents().find((entry) => entry.kind === 'projectile')!;
  await storage.put({ ...projectile, id: 'kept' });
  await storage.put({ ...projectile, id: 'unknown-kind', kind: 'ignition-primer' } as unknown as ComponentEntry);
  const library = new ComponentLibrary(storage, []);
  await library.ready;
  expect(library.entries.map((entry) => entry.id)).toEqual(['kept']);
});
