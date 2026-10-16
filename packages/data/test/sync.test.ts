import { readFileSync } from 'node:fs';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, importGrtPropellant } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { cachedDocuments, readDocument, sha256, synchronise, type CachedFile, type ComponentKind, type DataCache } from '../src/index.ts';

const BASE = 'https://data.example/';

/** A powder file of the repository, from a community powder. */
function powderFile(): string {
  const result = importGrtPropellant(
    readFileSync(new URL('../../formats/test/fixtures/cc0/powders/Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error('fixture');
  const { unmapped: _unmapped, ...value } = result.value;
  const provenance = { origin: 'test', source: 'test', file: 'Red Dot', author: 'Tom24', date: '2023-06-21', method: 'test', status: 'unverified' };
  return `${JSON.stringify({ format: 'gordons-legacy.component', version: 1, kind: 'powder', provenance, value }, null, 2)}\n`;
}

/** A gun file of the repository: one maker's published guns (issue #30). */
function firearmFile(): string {
  const value = [{
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: 'Glock 17 Gen5',
    maker: 'Glock',
    model: '17 Gen5',
    cartridge: '9x19 mm',
    barrel: { name: 'Glock 17 Gen5', length: 0.114, gunMass: 0.705, gasLeaks: [] },
    source: { kind: 'published', publisher: 'Glock Ges.m.b.H.', url: 'https://example.invalid/g17', retrieved: '2026-10-15', massBasis: 'empty-magazine' },
  }];
  const provenance = { origin: 'test', source: 'test', file: 'g17', author: 'Glock', date: '2026-10-15', method: 'test', status: 'published' };
  return `${JSON.stringify({ format: 'gordons-legacy.component', version: 1, kind: 'firearm', provenance, value }, null, 2)}\n`;
}

/** A server holding `files`, counting downloads. */
function server(files: Record<string, string>) {
  const downloads: string[] = [];
  const fetch = async (url: string) => {
    const path = decodeURIComponent(url.slice(BASE.length));
    downloads.push(path);
    const text = files[path];
    return { ok: text !== undefined, text: async () => text ?? '' };
  };
  return { fetch, downloads };
}

function memoryCache(): DataCache & { files: Map<string, CachedFile> } {
  const files = new Map<string, CachedFile>();
  return {
    files,
    list: async () => [...files.values()],
    put: async (file) => void files.set(file.path, file),
    remove: async (path) => void files.delete(path),
  };
}

async function index(entries: Array<{ path: string; text: string; kind?: ComponentKind }>): Promise<string> {
  const files = await Promise.all(entries.map(async ({ path, text, kind }) => ({ path, kind: kind ?? 'powder', name: path, sha256: await sha256(text) })));
  return JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files });
}

describe('synchronise', () => {
  test('a malformed component cannot break offline reading or replace a valid cached copy', async () => {
    expect(readDocument('null')).toBeUndefined();
    const cache = memoryCache();
    const path = 'powders/red-dot.json';
    const previous = powderFile();
    const saved = { path, text: previous, sha256: await sha256(previous) };
    await cache.put(saved);
    for (const text of ['null', previous.replace(/"bulkDensity": [0-9.]+/, '"bulkDensity": -1')]) {
      const report = await synchronise(BASE, cache, server({ [path]: text, 'index.json': await index([{ path, text }]) }).fetch);
      expect(report).toMatchObject({ downloaded: 0, documents: [], failed: [{ path, reason: 'content' }] });
      expect(cache.files.get(path)).toEqual(saved);
    }
    await cache.put({ path: 'powders/broken.json', text: 'null', sha256: await sha256('null') });
    expect(await cachedDocuments(cache)).toHaveLength(1);
  });

  test('rejects malformed or duplicate index entries before any cache change', async () => {
    const text = powderFile();
    const path = 'powders/red-dot.json';
    const valid = JSON.parse(await index([{ path, text }]));
    const entry = valid.files[0];
    const invalid = [null, { ...valid, files: null },
      ...[null, {}, { ...entry, kind: 'unknown' }, { ...entry, sha256: 'bad' },
        { ...entry, name: 4 }, { ...entry, path: '../outside.json' }].map((item) => ({ ...valid, files: [item] })),
      { ...valid, files: [entry, entry] },
    ];
    for (const value of invalid) {
      const cache = memoryCache();
      const saved = { path, text, sha256: entry.sha256 };
      await cache.put(saved);
      const remote = server({ 'index.json': JSON.stringify(value) });
      await expect(synchronise(BASE, cache, remote.fetch, ['firearm'])).rejects.toThrow(/index/i);
      expect(remote.downloads).toEqual(['index.json']);
      expect([...cache.files.values()]).toEqual([saved]);
    }
  });

  test('downloads what is new, keeps what is unchanged, and reads it offline afterwards', async () => {
    const text = powderFile();
    const files = { 'powders/red-dot.json': text, 'index.json': await index([{ path: 'powders/red-dot.json', text }]) };
    const cache = memoryCache();
    const first = await synchronise(BASE, cache, server(files).fetch);
    expect(first).toMatchObject({ downloaded: 1, unchanged: 0, failed: [] });
    expect(first.documents[0]).toMatchObject({ path: 'powders/red-dot.json', document: { kind: 'powder', value: { product: 'Red Dot' } } });

    const again = server(files);
    const second = await synchronise(BASE, cache, again.fetch);
    expect(second).toMatchObject({ downloaded: 0, unchanged: 1 });
    expect(again.downloads).toEqual(['index.json']);
    expect(await cachedDocuments(cache)).toHaveLength(1);
  });

  test('a file whose bytes differ from the index is refused, and nothing of it is cached', async () => {
    const text = powderFile();
    const files = { 'powders/red-dot.json': text.replace('"Red Dot"', '"Red Dot (tampered)"'), 'index.json': await index([{ path: 'powders/red-dot.json', text }]) };
    const cache = memoryCache();
    const report = await synchronise(BASE, cache, server(files).fetch);
    expect(report.failed).toEqual([{ path: 'powders/red-dot.json', reason: 'hash' }]);
    expect(report.documents).toEqual([]);
    expect(cache.files.size).toBe(0);
  });

  test('a file with impossible values is left out', async () => {
    const text = powderFile().replace(/"bulkDensity": [0-9.]+/, '"bulkDensity": -1');
    const files = { 'powders/bad.json': text, 'index.json': await index([{ path: 'powders/bad.json', text }]) };
    const report = await synchronise(BASE, memoryCache(), server(files).fetch);
    expect(report.failed).toEqual([{ path: 'powders/bad.json', reason: 'content' }]);
  });

  test('files the index no longer lists are dropped from the cache', async () => {
    const text = powderFile();
    const cache = memoryCache();
    await synchronise(BASE, cache, server({ 'powders/red-dot.json': text, 'index.json': await index([{ path: 'powders/red-dot.json', text }]) }).fetch);
    const report = await synchronise(BASE, cache, server({ 'index.json': await index([]) }).fetch);
    expect(report.removed).toBe(1);
    expect(cache.files.size).toBe(0);
  });

  test("a maker's guns are read with what their figures mean", async () => {
    const text = firearmFile();
    const files = { 'firearms/glock.json': text, 'index.json': await index([{ path: 'firearms/glock.json', text, kind: 'firearm' }]) };
    const report = await synchronise(BASE, memoryCache(), server(files).fetch);
    expect(report.failed).toEqual([]);
    expect(report.documents[0]!.document).toMatchObject({
      kind: 'firearm',
      value: [{ name: 'Glock 17 Gen5', barrel: { length: 0.114 }, source: { massBasis: 'empty-magazine' } }],
    });
  });

  test('a gun the format rejects loses its maker file, rather than leaving a catalogue with a hole in it', async () => {
    const text = firearmFile().replace('"length": 0.114', '"length": 0');
    const files = { 'firearms/glock.json': text, 'index.json': await index([{ path: 'firearms/glock.json', text, kind: 'firearm' }]) };
    const report = await synchronise(BASE, memoryCache(), server(files).fetch);
    expect(report.failed).toEqual([{ path: 'firearms/glock.json', reason: 'content' }]);
  });

  test('the components come without the gun database, and the guns later, without losing either', async () => {
    const powder = powderFile();
    const gun = firearmFile();
    const files = {
      'powders/red-dot.json': powder,
      'firearms/glock.json': gun,
      'index.json': await index([
        { path: 'powders/red-dot.json', text: powder },
        { path: 'firearms/glock.json', text: gun, kind: 'firearm' },
      ]),
    };
    const cache = memoryCache();
    const components = server(files);
    const first = await synchronise(BASE, cache, components.fetch, ['powder', 'projectile', 'caliber']);
    expect(first).toMatchObject({ downloaded: 1, removed: 0 });
    expect(first.documents.map(({ document }) => document.kind)).toEqual(['powder']);
    expect(components.downloads).toEqual(['index.json', 'powders/red-dot.json']);

    // Asking for the guns leaves the powder in the cache: only what the index drops is dropped.
    const guns = server(files);
    const second = await synchronise(BASE, cache, guns.fetch, ['firearm']);
    expect(second).toMatchObject({ downloaded: 1, removed: 0 });
    expect(second.documents.map(({ document }) => document.kind)).toEqual(['firearm']);
    expect(guns.downloads).toEqual(['index.json', 'firearms/glock.json']);
    expect(cache.files.size).toBe(2);
    expect((await cachedDocuments(cache)).map(({ document }) => document.kind).sort()).toEqual(['firearm', 'powder']);
  });

  test('an unreadable index throws, so the caller keeps what it had', async () => {
    await expect(synchronise(BASE, memoryCache(), server({}).fetch)).rejects.toThrow();
    await expect(synchronise(BASE, memoryCache(), server({ 'index.json': '{"format":"other"}' }).fetch)).rejects.toThrow();
  });
});
