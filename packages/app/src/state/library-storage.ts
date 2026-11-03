import type { Load } from '@gordons-legacy/formats';
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
  /**
   * A token made anew at every write of the entry. A tab replaces the entry only while it still holds
   * the revision it read, so that another tab's save is never overwritten unseen (#32); a date is no
   * such token, since two saves can share a millisecond. Absent on entries written before 2026-11-03.
   */
  revision?: string;
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
  return indexedDbStore<LibraryEntry>('library', factory);
}
