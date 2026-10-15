import { readFileSync } from 'node:fs';
import { importGrtPropellant } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { cachedDocuments, sha256, synchronise, type CachedFile, type DataCache } from '../src/index.ts';

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

async function index(entries: Array<{ path: string; text: string }>): Promise<string> {
  const files = await Promise.all(entries.map(async ({ path, text }) => ({ path, kind: 'powder', name: path, sha256: await sha256(text) })));
  return JSON.stringify({ format: 'gordons-legacy.data-index', version: 1, files });
}

describe('synchronise', () => {
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

  test('an unreadable index throws, so the caller keeps what it had', async () => {
    await expect(synchronise(BASE, memoryCache(), server({}).fetch)).rejects.toThrow();
    await expect(synchronise(BASE, memoryCache(), server({ 'index.json': '{"format":"other"}' }).fetch)).rejects.toThrow();
  });
});
