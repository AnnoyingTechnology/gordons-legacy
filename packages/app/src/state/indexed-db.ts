/**
 * The app's IndexedDB database: one object store per kind of saved thing, keyed by `id`. Version 2 added
 * the user's components beside the library of loads; version 3 the data repository's files; version 4
 * the user's guns.
 */
const DATABASE = 'gordons-legacy';
const VERSION = 4;
export type StoreName = 'library' | 'components' | 'data' | 'firearms';
const STORES: StoreName[] = ['library', 'components', 'data', 'firearms'];

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
      request.onsuccess = () => {
        const connection = request.result;
        const forget = () => { if (opened.get(factory) === database) opened.delete(factory); };
        connection.onversionchange = () => { connection.close(); forget(); };
        connection.onclose = forget;
        resolve(connection);
      };
      request.onerror = () => reject(request.error);
    });
    opened.set(factory, database);
    // A temporary denial must not make every subsequent operation reuse a rejected promise.
    void database.catch(() => { if (opened.get(factory) === database) opened.delete(factory); });
  }
  return database;
}

export function indexedDbStore<T extends { id: string }>(name: StoreName, factory: IDBFactory = indexedDB): RecordStore<T> {
  const run = async <R>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const database = await open(factory);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(name, mode);
      const request = action(transaction.objectStore(name));
      // Request success only means the operation ran; its transaction can still abort afterward.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
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
