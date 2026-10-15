/**
 * The app's IndexedDB database: one object store per kind of saved thing, keyed by `id`. Version 2 added
 * the user's components beside the library of loads; version 3 the data repository's files.
 */
const DATABASE = 'gordons-legacy';
const VERSION = 3;
export type StoreName = 'library' | 'components' | 'data';
const STORES: StoreName[] = ['library', 'components', 'data'];

/** A record store: list, put and remove records that carry an `id`. */
export interface RecordStore<T extends { id: string }> {
  list(): Promise<T[]>;
  put(record: T): Promise<void>;
  remove(id: string): Promise<void>;
}

const opened = new Map<IDBFactory, Promise<IDBDatabase>>();

function open(factory: IDBFactory): Promise<IDBDatabase> {
  let database = opened.get(factory);
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    opened.set(factory, database);
  }
  return database;
}

export function indexedDbStore<T extends { id: string }>(name: StoreName, factory: IDBFactory = indexedDB): RecordStore<T> {
  const run = async <R>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const store = (await open(factory)).transaction(name, mode).objectStore(name);
    return new Promise((resolve, reject) => {
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  return {
    list: async () => (await run('readonly', (store) => store.getAll())) as T[],
    put: async (record) => void (await run('readwrite', (store) => store.put(record))),
    remove: async (id) => void (await run('readwrite', (store) => store.delete(id))),
  };
}

/** The same in memory, for tests. */
export function memoryStore<T extends { id: string }>(): RecordStore<T> {
  const records = new Map<string, T>();
  return {
    list: async () => [...records.values()].map((record) => structuredClone(record)),
    put: async (record) => void records.set(record.id, structuredClone(record)),
    remove: async (id) => void records.delete(id),
  };
}
