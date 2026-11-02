import { parseLoad, serializeLoad, type Load } from '@gordons-legacy/formats';
import type { Inventory, StockItem } from '../state/inventory.ts';
import type { Library, LibraryEntry } from '../state/library.ts';

/**
 * What two copies of the app exchange through the camera (issue #21): the stock and the library, every
 * entry with its id and date, so that the newer of two edits of one entry wins on both sides and an
 * exchange repeated changes nothing. Removals are not carried: an entry removed on one side comes back
 * from the other, which is the safe direction for a reloader's records. Photos are not carried either:
 * one photo would be thousands of codes. A load replaced by a newer one from the other device keeps the
 * photos it had here, and its shot groups keep their photo by title.
 *
 * The text is JSON, compressed (deflate) and written in base64url, which QR codes carry in byte mode.
 */
export const SYNC_FORMAT = 'gordons-legacy.sync';
export const SYNC_VERSION = 1;

interface SyncDocument {
  format: typeof SYNC_FORMAT;
  version: typeof SYNC_VERSION;
  stock: StockItem[];
  loads: Array<Omit<LibraryEntry, 'load'> & { load: unknown }>;
}

export async function encodeSync(library: readonly LibraryEntry[], stock: readonly StockItem[]): Promise<string> {
  const document: SyncDocument = {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    stock: [...stock],
    loads: library.map(({ id, name, updatedAt, load }) => ({ id, name, updatedAt, load: JSON.parse(serializeLoad(withoutPhotos(load))) as unknown })),
  };
  return base64url(await transform(new TextEncoder().encode(JSON.stringify(document)), new CompressionStream('deflate-raw')));
}

/** What an exchange brought: entries taken because new or newer, and entries that could not be read. */
export interface SyncResult {
  taken: number;
  unreadable: number;
}

/** Reads an exchange and merges it into the library and the stock. Undefined: not an exchange of ours. */
export async function receiveSync(text: string, library: Library, inventory: Inventory): Promise<SyncResult | undefined> {
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder().decode(await transform(fromBase64url(text), new DecompressionStream('deflate-raw'))));
  } catch {
    return undefined;
  }
  if (!isSyncDocument(document)) return undefined;
  let taken = 0;
  let unreadable = 0;
  for (const item of document.stock) {
    if (await inventory.receive(item)) taken++;
  }
  for (const entry of document.loads) {
    const parsed = parseLoad(JSON.stringify(entry.load));
    if (!parsed.ok || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.updatedAt !== 'string') {
      unreadable++;
      continue;
    }
    const local = library.get(entry.id);
    const load = local ? withPhotosOf(parsed.value, local.load) : parsed.value;
    if (await library.receive({ id: entry.id, name: entry.name, updatedAt: entry.updatedAt, load })) taken++;
  }
  return { taken, unreadable };
}

/** The load without its photos, and its shot groups without their links to them. */
export function withoutPhotos(load: Load): Load {
  const shotGroups = load.shotGroups?.map(({ picture: _picture, ...group }) => group);
  return { ...load, pictures: [], ...(shotGroups ? { shotGroups } : {}) };
}

/** A load received without photos, given back the photos the local copy had, shot groups by title. */
export function withPhotosOf(received: Load, local: Load): Load {
  const shotGroups = received.shotGroups?.map((group) => {
    const picture = local.shotGroups?.find((localGroup) => localGroup.title === group.title)?.picture;
    return picture ? { ...group, picture } : group;
  });
  return { ...received, pictures: local.pictures, ...(shotGroups ? { shotGroups } : {}) };
}

function isSyncDocument(value: unknown): value is SyncDocument {
  const document = value as Partial<SyncDocument> | null;
  return (
    typeof document === 'object' && document !== null && document.format === SYNC_FORMAT && document.version === SYNC_VERSION &&
    Array.isArray(document.stock) && Array.isArray(document.loads)
  );
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
