import { checkCaliber, checkFirearm, checkProjectile, checkPropellant } from '@gordons-legacy/formats';
import { isDataIndex } from './index-shape.ts';
import type { ComponentDocument, ComponentKind, DataIndexEntry, Provenance } from './repository.ts';

/** A file kept from an earlier synchronisation: its text and the hash it was checked against. */
export interface CachedFile {
  path: string;
  sha256: string;
  text: string;
}

/** Where downloaded files are kept between visits: IndexedDB in the app, memory in tests. */
export interface DataCache {
  list(): Promise<CachedFile[]>;
  put(file: CachedFile): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface SyncReport {
  /** The components now available from the repository, checked, by their path in it. */
  documents: Array<{ path: string; document: ComponentDocument }>;
  downloaded: number;
  /** Files kept from the cache because their hash didn't change. */
  unchanged: number;
  /** Files dropped from the cache because the repository no longer lists them. */
  removed: number;
  /** Paths whose download, hash or content failed; they are left out. */
  failed: Array<{ path: string; reason: 'download' | 'hash' | 'content' }>;
}

type Fetch = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

/** Downloads at a time: a first visit fetches a few hundred small files. */
const PARALLEL_DOWNLOADS = 16;

/** Runs `task` on every item, at most `limit` at a time. */
async function inParallel<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Brings the cache in line with the repository: reads `index.json`, downloads the files that are new or
 * whose hash changed, checks each file's SHA-256 against the index and its content against the load
 * format, and drops files the index no longer lists. A file that fails any check is left out, never
 * half-used. Throws when the index itself can't be read, so that the caller keeps what it had.
 *
 * `kinds` limits what is downloaded and returned, so the gun database (hundreds of files) is fetched
 * when a user looks for their gun rather than on a first visit. Files of the other kinds stay in the
 * cache untouched: what the index no longer lists is dropped whatever its kind, so the cache never
 * keeps a file the repository has withdrawn.
 */
export async function synchronise(baseUrl: string, cache: DataCache, fetch: Fetch, kinds?: readonly ComponentKind[]): Promise<SyncReport> {
  const response = await fetch(`${baseUrl}index.json`);
  if (!response.ok) throw new Error('index.json could not be downloaded');
  const index: unknown = JSON.parse(await response.text());
  if (!isDataIndex(index)) {
    throw new Error('index.json is not a data index of a version this application reads');
  }
  if (new Set(index.files.map((entry) => entry.path)).size !== index.files.length) {
    throw new Error('index.json lists a file more than once');
  }
  const cached = new Map((await cache.list()).map((file) => [file.path, file]));
  const report: SyncReport = { documents: [], downloaded: 0, unchanged: 0, removed: 0, failed: [] };
  const listed = new Set<string>();

  // Unchanged files come from the cache; the others are downloaded a few at a time.
  const files = new Map<string, CachedFile>();
  const missing: DataIndexEntry[] = [];
  for (const entry of index.files) {
    listed.add(entry.path);
    if (kinds !== undefined && !kinds.includes(entry.kind)) continue;
    const file = cached.get(entry.path);
    if (file && file.sha256 === entry.sha256 && (await sha256(file.text)) === entry.sha256) {
      files.set(entry.path, file);
      report.unchanged++;
    } else {
      missing.push(entry);
    }
  }
  await inParallel(missing, PARALLEL_DOWNLOADS, async (entry) => {
    const file = await download(baseUrl, entry, fetch, report);
    if (!file) return;
    await cache.put(file);
    files.set(entry.path, file);
    report.downloaded++;
  });
  for (const entry of index.files) {
    const file = files.get(entry.path);
    if (!file) continue;
    const document = readDocument(file.text, entry);
    if (document) report.documents.push({ path: entry.path, document });
    else report.failed.push({ path: entry.path, reason: 'content' });
  }
  for (const path of cached.keys()) {
    if (!listed.has(path)) {
      await cache.remove(path);
      report.removed++;
    }
  }
  return report;
}

/** The components of the cache alone, for use offline, by path; each is checked again. */
export async function cachedDocuments(cache: DataCache): Promise<Array<{ path: string; document: ComponentDocument }>> {
  const documents: Array<{ path: string; document: ComponentDocument }> = [];
  for (const file of await cache.list()) {
    if ((await sha256(file.text)) !== file.sha256) continue;
    const document = readDocument(file.text);
    if (document) documents.push({ path: file.path, document });
  }
  return documents;
}

async function download(baseUrl: string, entry: DataIndexEntry, fetch: Fetch, report: SyncReport): Promise<CachedFile | undefined> {
  let text: string;
  try {
    const response = await fetch(`${baseUrl}${entry.path.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error();
    text = await response.text();
  } catch {
    report.failed.push({ path: entry.path, reason: 'download' });
    return undefined;
  }
  if ((await sha256(text)) !== entry.sha256) {
    report.failed.push({ path: entry.path, reason: 'hash' });
    return undefined;
  }
  // A matching hash identifies bytes; it does not make them a valid component. Check before put()
  // replaces the previous usable offline copy.
  if (!readDocument(text, entry)) {
    report.failed.push({ path: entry.path, reason: 'content' });
    return undefined;
  }
  return { path: entry.path, sha256: entry.sha256, text };
}

/** A component file, checked field by field as a saved load's part would be; undefined if not one. */
export function readDocument(text: string, entry?: DataIndexEntry): ComponentDocument | undefined {
  let parsed: { format?: unknown; version?: unknown; kind?: unknown; provenance?: unknown; value?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  if (parsed.format !== 'gordons-legacy.component' || parsed.version !== 1) return undefined;
  if (entry && parsed.kind !== entry.kind) return undefined;
  const provenance = readProvenance(parsed.provenance);
  if (!provenance) return undefined;
  const base = { format: 'gordons-legacy.component', version: 1, provenance } as const;
  if (parsed.kind === 'powder') {
    const result = checkPropellant(parsed.value);
    return result.ok ? { ...base, kind: 'powder', value: result.value } : undefined;
  }
  if (parsed.kind === 'projectile') {
    const result = checkProjectile(parsed.value);
    return result.ok ? { ...base, kind: 'projectile', value: result.value } : undefined;
  }
  if (parsed.kind === 'caliber') {
    const result = checkCaliber(parsed.value);
    return result.ok ? { ...base, kind: 'caliber', value: result.value } : undefined;
  }
  if (parsed.kind === 'firearm') return firearmList(base, parsed.value);
  return undefined;
}

/**
 * One maker's guns. The file is taken whole or not at all, as every other file is: a gun the format
 * rejects is a bug in the export, and a catalogue that silently lost a few guns would hide it.
 */
function firearmList(base: { format: 'gordons-legacy.component'; version: 1; provenance: Provenance }, value: unknown): ComponentDocument | undefined {
  if (!Array.isArray(value)) return undefined;
  const guns = [];
  for (const gun of value) {
    const result = checkFirearm(gun);
    if (!result.ok) return undefined;
    guns.push(result.value);
  }
  return { ...base, kind: 'firearm', value: guns };
}

function readProvenance(value: unknown): Provenance | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const keys = ['origin', 'source', 'file', 'author', 'date', 'method', 'status'] as const;
  if (!keys.every((key) => typeof record[key] === 'string')) return undefined;
  return Object.fromEntries(keys.map((key) => [key, record[key] as string])) as unknown as Provenance;
}

/** SHA-256 of a text's UTF-8 bytes, hexadecimal: Web Crypto, in browsers and Node alike. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
