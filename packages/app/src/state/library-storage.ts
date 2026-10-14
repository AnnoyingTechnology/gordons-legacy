import { parseLoad, type Load } from '@gordons-legacy/formats';
import { indexedDbStore, memoryStore, type RecordStore } from './indexed-db.ts';

/** A load kept in the user's library. */
export interface LibraryEntry {
  /** Stable identifier, made when the load first enters the library. */
  id: string;
  /** The name shown in lists and tabs. */
  name: string;
  load: Load;
  /** When the entry was last saved, ISO 8601. */
  updatedAt: string;
}

/** Where library entries live: the browser's IndexedDB in the app, memory in tests. */
export type LibraryStorage = RecordStore<LibraryEntry>;

export function memoryStorage(): LibraryStorage {
  return memoryStore<LibraryEntry>();
}

/**
 * The library in IndexedDB, which holds far more than localStorage (pictures included) and survives
 * reloads. Browsers may still clear it under storage pressure unless persistence is granted, which the
 * app requests; a backup file is the user's safeguard.
 */
export function indexedDbStorage(factory: IDBFactory = indexedDB): LibraryStorage {
  const store = indexedDbStore<LibraryEntry>('library', factory);
  return {
    ...store,
    // Entries are checked like a file being opened, so that a damaged record can't reach the engine.
    list: async () => (await store.list()).flatMap(checked),
  };
}

function checked(entry: LibraryEntry): LibraryEntry[] {
  const result = parseLoad(JSON.stringify(entry.load));
  return result.ok ? [{ ...entry, load: result.value }] : [];
}
