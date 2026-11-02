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

/**
 * The most an exchange may decompress to, bytes. A few kB compress to the frames a camera reads, and a
 * crafted few kB can decompress to gigabytes: reading stops here instead of filling the tab's memory.
 */
const MAXIMUM_DECOMPRESSED = 20 * 1024 * 1024;

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
    document = JSON.parse(new TextDecoder().decode(await decompress(fromBase64url(text))));
  } catch {
    return undefined;
  }
  if (!isSyncDocument(document)) return undefined;
  let taken = 0;
  let unreadable = 0;
  // Each entry on its own: one that can't be read or written is counted, and the rest still come in.
  for (const item of document.stock) {
    try {
      if (await inventory.receive(item)) taken++;
    } catch {
      unreadable++;
    }
  }
  for (const entry of document.loads as unknown[]) {
    const fields = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const parsed = parseLoad(JSON.stringify(fields['load'] ?? null));
    const { id, name, updatedAt } = fields;
    if (!parsed.ok || typeof id !== 'string' || id === '' || typeof name !== 'string' || typeof updatedAt !== 'string') {
      unreadable++;
      continue;
    }
    try {
      const local = library.get(id);
      const load = local ? withPhotosOf(parsed.value, local.load) : parsed.value;
      if (await library.receive({ id, name, updatedAt, load })) taken++;
    } catch {
      unreadable++;
    }
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

/** Inflates, stopping at `MAXIMUM_DECOMPRESSED`. */
async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAXIMUM_DECOMPRESSED) {
      await reader.cancel();
      throw new RangeError('exchange too large');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
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
