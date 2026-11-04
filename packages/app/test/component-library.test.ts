import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { DATA_REPOSITORY_URL, sha256, type CachedFile, type DataCache } from '@gordons-legacy/data';
import grtCatalogue from '../src/data/grt-catalogue.json' with { type: 'json' };
import { communityComponents, ComponentLibrary, grtComponents, originLabel, type ComponentEntry } from '../src/state/components.ts';
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

test('a file the storage refuses leaves the library as it was (#32)', async () => {
  const storage = memoryStore<ComponentEntry>();
  const library = new ComponentLibrary(storage, []);
  await library.ready;
  storage.putAll = async () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  const text = readFileSync(new URL('../../formats/test/fixtures/cc0/powders/Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant', import.meta.url), 'utf8');
  await expect(library.importFile('Red Dot.propellant', text)).rejects.toThrow('full');
  expect(library.powders()).toHaveLength(0);
  expect(await storage.list()).toHaveLength(0);
});

/** GRT's own database, bundled with the app (issue #19; docs/data/grt-catalogue.md gives the counts). */
test("GRT's catalogue is bundled: 227 powders, 5,646 bullets and 577 cartridges, labelled GRT's", () => {
  const entries = grtComponents();
  expect(entries.filter((entry) => entry.kind === 'propellant')).toHaveLength(227);
  expect(entries.filter((entry) => entry.kind === 'projectile')).toHaveLength(5646);
  expect(entries.filter((entry) => entry.kind === 'caliber')).toHaveLength(577);
  expect(entries.every((entry) => entry.source.origin === 'grt')).toBe(true);
  const varget = entries.find((entry) => entry.kind === 'propellant' && entry.value.product === 'Varget')!;
  expect(varget.source).toMatchObject({ origin: 'grt', file: 'GordonsReloadingTool.db', author: '' });
  expect(varget.source.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(originLabel(varget.source)).toBe('components.grt');
});

/** A server holding a data repository of `documents`, and an empty cache. */
async function repository(documents: Array<{ path: string; document: unknown }>) {
  const files = new Map(documents.map(({ path, document }) => [path, JSON.stringify(document)]));
  const index = {
    format: 'gordons-legacy.data-index',
    version: 1,
    files: await Promise.all(documents.map(async ({ path, document }) => ({ path, name: path, kind: (document as { kind: string }).kind, sha256: await sha256(files.get(path)!) }))),
  };
  files.set('index.json', JSON.stringify(index));
  const fetch = async (url: string) => {
    const text = files.get(decodeURIComponent(url.slice(DATA_REPOSITORY_URL.length)));
    return { ok: text !== undefined, text: async () => text ?? '' };
  };
  const cached = new Map<string, CachedFile>();
  const cache: DataCache = { list: async () => [...cached.values()], put: async (file) => void cached.set(file.path, file), remove: async (path) => void cached.delete(path) };
  return { fetch, cache };
}

const bundledGrt = grtCatalogue as Array<{ path: string; document: unknown }>;
const vihtavuori = bundledGrt.find((document) => document.path === 'grt/powders/vihtavuori.json')!;

const hodgdon = bundledGrt.find((document) => document.path === 'grt/powders/hodgdon.json')!;
const grtPowders = (library: ComponentLibrary) => library.powders().filter((entry) => entry.source.origin === 'grt');

test('offline, a cached document replaces its bundled copy and the other bundled documents stay', async () => {
  const offline = await repository([vihtavuori]);
  await offline.cache.put({ path: vihtavuori.path, sha256: await sha256(JSON.stringify(vihtavuori.document)), text: JSON.stringify(vihtavuori.document) });
  const library = new ComponentLibrary(memoryStore<ComponentEntry>(), [...communityComponents(), ...grtComponents()]);
  await library.useRepository(offline.cache, async () => { throw new Error('offline'); });
  expect(library.communitySource).toBe('cache');
  expect(grtPowders(library)).toHaveLength(227);
  expect(library.powders().filter((entry) => entry.source.origin === 'community')).toHaveLength(12);
});

test('a synchronised repository is the word on its documents: one it no longer lists is withdrawn, one that failed stays', async () => {
  const library = new ComponentLibrary(memoryStore<ComponentEntry>(), grtComponents([vihtavuori, hodgdon]));
  // Hodgdon's file is listed but its download fails: the copy we have stays.
  const served = await repository([vihtavuori, hodgdon]);
  const failing = async (url: string) => (url.endsWith('hodgdon.json') ? { ok: false, text: async () => '' } : served.fetch(url));
  await library.useRepository(served.cache, failing);
  expect(new Set(grtPowders(library).map((entry) => entry.value.maker))).toEqual(new Set(['Vihtavuori', 'Hodgdon']));
  // The repository withdraws Hodgdon's file: its powders go, also from what the cache gives offline.
  const withdrawn = await repository([vihtavuori]);
  await library.useRepository(withdrawn.cache, withdrawn.fetch);
  expect(new Set(grtPowders(library).map((entry) => entry.value.maker))).toEqual(new Set(['Vihtavuori']));
  // The bundled entry and the downloaded one share an id: the same document, the same place in it.
  expect(grtPowders(library)[0]!.id).toBe(grtComponents([vihtavuori])[0]!.id);
});

test("a repository that doesn't list GRT's catalogue takes it away, and keeps the user's own", async () => {
  const redDot = communityComponents().find((entry) => entry.kind === 'propellant')!;
  const provenance = { origin: 'test', source: 'test', file: 'Red Dot', author: 'Tom24', date: '2023-06-21', method: 'test', status: 'unverified' };
  const communityOnly = await repository([{ path: 'powders/red-dot.json', document: { format: 'gordons-legacy.component', version: 1, kind: 'powder', provenance, value: redDot.value } }]);
  const storage = memoryStore<ComponentEntry>();
  const library = new ComponentLibrary(storage, [...communityComponents(), ...grtComponents()]);
  await library.ready;
  const text = readFileSync(new URL('../../formats/test/fixtures/cc0/powders/Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant', import.meta.url), 'utf8');
  await library.importFile('Red Dot.propellant', text);
  await library.useRepository(communityOnly.cache, communityOnly.fetch);
  expect(library.powders().map((entry) => entry.source.origin).sort()).toEqual(['community', 'user']);
});
