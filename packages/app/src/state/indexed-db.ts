/**
 * The app's IndexedDB database: one object store per kind of saved thing, keyed by `id`. Version 2 added
 * the user's components beside the library of loads; version 3 the data repository's files; version 4
 * the user's guns; version 5 the stock (inventory.ts).
 */
const DATABASE = 'gordons-legacy';
const VERSION = 5;
export type StoreName = 'library' | 'components' | 'data' | 'firearms' | 'inventory';
const STORES: StoreName[] = ['library', 'components', 'data', 'firearms', 'inventory'];

/** A record store: list, put and remove records that carry an `id`. */
export interface RecordStore<T extends { id: string }> {
  list(): Promise<T[]>;
  put(record: T): Promise<void>;
  /** Puts several records in one transaction: all of them are written, or none. */
  putAll(records: readonly T[]): Promise<void>;
  /**
   * Puts the record only if `unchanged` accepts the one stored under its id (undefined when none), read
   * in the same transaction, so that no other tab writes in between. Resolves whether it was written.
   */
  putIf(record: T, unchanged: (stored: unknown) => boolean): Promise<boolean>;
  /** The same for several records in one transaction: all are written if `unchanged` accepts each one's stored record, or none. */
  putAllIf(records: readonly T[], unchanged: (stored: unknown, record: T) => boolean): Promise<boolean>;
  remove(id: string): Promise<void>;
}

/**
 * The stored values that are records of ours: an object with a string `id`, which is the one field this
 * interface promises and the key everything downstream removes, replaces and renders by (#32).
 *
 * `getAll()` returns whatever is in the store — a record written by an older version of the app, or one
 * damaged on disk — and the type assertion that used to stand here promised a shape nobody had checked.
 * A value with no usable key is dropped here rather than reaching a library, where the first field read
 * off it would throw inside the promise that the whole list depends on: one bad record would then empty
 * a user's library instead of itself.
 */
export function keyedRecords<T extends { id: string }>(values: readonly unknown[]): T[] {
  return values.filter((value): value is T => {
    const record = value as { id?: unknown } | null;
    return typeof record === 'object' && record !== null && !Array.isArray(record) && typeof record.id === 'string' && record.id !== '';
  });
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
  // Every record is read, then all are written or none, in one transaction: no other tab writes between.
  const putAllIf = async (records: readonly T[], unchanged: (stored: unknown, record: T) => boolean): Promise<boolean> => {
    const database = await open(factory);
    return new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction(name, 'readwrite');
      const store = transaction.objectStore(name);
      const stored: unknown[] = [];
      let written = false;
      records.forEach((record, index) => {
        const read = store.get(record.id);
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          stored[index] = read.result;
          // Requests of a transaction complete in order: the last read sees them all.
          if (index !== records.length - 1) return;
          if (!records.every((candidate, position) => unchanged(stored[position], candidate))) return;
          for (const candidate of records) store.put(candidate);
          written = true;
        };
      });
      transaction.oncomplete = () => resolve(written);
      transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
    });
  };
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
    list: async () => keyedRecords<T>(await run('readonly', (store) => store.getAll())),
    put: async (record) => void (await run('readwrite', (store) => store.put(record))),
    putAll: async (records) => {
      if (records.length === 0) return;
      // One transaction: the requests share it, and an abort undoes all of them.
      await run('readwrite', (store) => records.map((record) => store.put(record)).at(-1)!);
    },
    putIf: (record, unchanged) => putAllIf([record], (stored) => unchanged(stored)),
    putAllIf: (records, unchanged) => putAllIf(records, unchanged),
    remove: async (id) => void (await run('readwrite', (store) => store.delete(id))),
  };
}

/** The same in memory, for tests. */
export function memoryStore<T extends { id: string }>(): RecordStore<T> {
  const records = new Map<string, T>();
  return {
    list: async () => [...records.values()].map((record) => structuredClone(record)),
    put: async (record) => void records.set(record.id, structuredClone(record)),
    putAll: async (list) => void list.forEach((record) => records.set(record.id, structuredClone(record))),
    putIf: async (record, unchanged) => {
      if (!unchanged(records.get(record.id))) return false;
      records.set(record.id, structuredClone(record));
      return true;
    },
    putAllIf: async (list, unchanged) => {
      if (!list.every((record) => unchanged(records.get(record.id), record))) return false;
      for (const record of list) records.set(record.id, structuredClone(record));
      return true;
    },
    remove: async (id) => void records.delete(id),
  };
}
