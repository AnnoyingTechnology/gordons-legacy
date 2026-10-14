import { parseLoad, type Load } from '@gordons-legacy/formats';

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
export interface LibraryStorage {
  list(): Promise<LibraryEntry[]>;
  put(entry: LibraryEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export function memoryStorage(): LibraryStorage {
  const entries = new Map<string, LibraryEntry>();
  return {
    list: async () => [...entries.values()].map((entry) => structuredClone(entry)),
    put: async (entry) => void entries.set(entry.id, structuredClone(entry)),
    remove: async (id) => void entries.delete(id),
  };
}

const DATABASE = 'gordons-legacy';
const STORE = 'library';

/**
 * The library in IndexedDB, which holds far more than localStorage (pictures included) and survives
 * reloads. Browsers may still clear it under storage pressure unless persistence is granted, which the
 * app requests; a backup file is the user's safeguard.
 */
export function indexedDbStorage(factory: IDBFactory = indexedDB): LibraryStorage {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const store = (await database).transaction(STORE, mode).objectStore(STORE);
    return new Promise((resolve, reject) => {
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  return {
    // Entries are checked like a file being opened, so that a damaged record can't reach the engine.
    list: async () => ((await run('readonly', (store) => store.getAll())) as LibraryEntry[]).flatMap(checked),
    put: async (entry) => void (await run('readwrite', (store) => store.put(entry))),
    remove: async (id) => void (await run('readwrite', (store) => store.delete(id))),
  };
}

function checked(entry: LibraryEntry): LibraryEntry[] {
  const result = parseLoad(JSON.stringify(entry.load));
  return result.ok ? [{ ...entry, load: result.value }] : [];
}
