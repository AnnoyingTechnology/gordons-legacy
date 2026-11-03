import { importGrtLoad, parseLoad, type Load } from '@gordons-legacy/formats';
import type { LibraryEntry, LibraryStorage } from './library-storage.ts';
import { EntryConflict, isRevision, newRevision } from './entry-revision.ts';
import { storedReading } from './stored-reading.ts';

export type { LibraryEntry } from './library-storage.ts';

/**
 * The user's own loads, kept in the browser, so that loads are saved and found without managing files
 * (issue #12). Listeners are told after every change.
 */
export class Library {
  entries: LibraryEntry[] = [];
  /** Settles once the stored entries are first read. */
  readonly ready: Promise<void>;
  private readonly storage: LibraryStorage;
  private readonly listeners = new Set<() => void>();
  /** Resolves once the entries are read, reading them again if the first reading failed. */
  readonly whenRead: () => Promise<void>;

  constructor(storage: LibraryStorage) {
    this.storage = storage;
    const reading = storedReading(() => storage.list().then((entries) => {
      this.entries = entries.flatMap(checked);
      this.changed();
    }));
    this.ready = reading.first;
    this.whenRead = reading.settled;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Reads the stored entries again: another tab of the app may have saved some since this one read
   * them. A backup does so first, so that it holds what is stored rather than what this tab saw (#32).
   */
  async refresh(): Promise<void> {
    await this.whenRead();
    this.entries = (await this.storage.list()).flatMap(checked);
    this.changed();
  }

  get(id: string): LibraryEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  /**
   * Saves a load as a new entry, or over the entry `target` names. That entry is replaced only while
   * it is still stored, at the revision the caller read (`target.revision`): another tab of the app, or
   * a sync, may have saved or removed it since, and that is not undone unseen (#32); the check and the
   * write share one transaction. That case throws `EntryConflict` (entry-revision.ts). Returns the entry as saved.
   */
  async save(name: string, load: Load, target?: { id: string; revision?: string | undefined }): Promise<LibraryEntry> {
    await this.whenRead();
    const entry: LibraryEntry = { id: target?.id ?? newId(), name, load, updatedAt: new Date().toISOString(), revision: newRevision() };
    if (target === undefined) {
      await this.storage.put(entry);
    } else {
      // The entry must still be there too: one removed meanwhile is not brought back unseen.
      if (!(await this.storage.putIf(entry, (stored) => isRevision(stored, target.revision)))) throw new EntryConflict(name);
    }
    this.replace(entry);
    return entry;
  }

  /**
   * Takes an entry from another device (sync/), keeping its id and date: it replaces the stored entry
   * of the same id only when it is newer than that one. `merged` makes the load to write from the
   * stored one (sync gives back the photos a phone was never sent); both the comparison and the merge
   * read the stored entry in the write's own transaction, so a newer save, or a photo, from another tab
   * is never replaced by what this tab had cached (#32). Returns whether it was taken.
   */
  async receive(entry: LibraryEntry, merged: (stored: Load | undefined) => Load = () => entry.load): Promise<boolean> {
    await this.whenRead();
    // Dates are compared as instants: `…:00Z` and `…:00.001Z` don't sort as text, and a date that isn't one is refused.
    const time = Date.parse(entry.updatedAt);
    if (!Number.isFinite(time)) return false;
    const received = await this.storage.update(entry.id, (stored) => {
      // A stored entry without a readable date (an older version's) counts as older than any.
      if (Date.parse(dateOf(stored)) >= time) return undefined;
      const [readable] = stored === undefined ? [] : checked(stored as LibraryEntry);
      return { ...entry, load: merged(readable?.load), revision: newRevision() };
    });
    if (received === undefined) return false;
    this.replace(received);
    return true;
  }

  async remove(id: string): Promise<void> {
    await this.whenRead();
    await this.storage.remove(id);
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.changed();
  }

  /**
   * Adds loads from files (`.grtload` or saved `.json`); says which couldn't be read and which the
   * storage refused. A GRT folder can come in at once, and one file that fails stops none of the others.
   */
  async importFiles(files: Array<{ name: string; text: string }>): Promise<ImportOutcome> {
    const outcome: ImportOutcome = { unreadable: [], unsaved: [] };
    for (const { name, text } of files) {
      const isGrt = name.toLowerCase().endsWith('.grtload');
      const result = isGrt ? importGrtLoad(text, { fileName: name }) : parseLoad(text);
      if (!result.ok) {
        outcome.unreadable.push(name);
        continue;
      }
      try {
        await this.save(name.replace(/\.(grtload|json)$/i, ''), result.value);
      } catch {
        outcome.unsaved.push(name);
      }
    }
    return outcome;
  }

  private replace(entry: LibraryEntry): void {
    this.entries = [...this.entries.filter((candidate) => candidate.id !== entry.id), entry];
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The date of a stored record, or '' when it has none. */
function dateOf(stored: unknown): string {
  const date = (stored as { updatedAt?: unknown } | undefined)?.updatedAt;
  return typeof date === 'string' ? date : '';
}

/** What became of the files given to `importFiles`, by name. */
export interface ImportOutcome {
  /** Files that are no load. */
  unreadable: string[];
  /** Loads the browser's storage refused (unavailable or full). */
  unsaved: string[];
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * A stored entry, or nothing: the load is checked like a file being opened, so that a damaged record
 * can't reach the engine, and the entry's own name and date are checked too, since a record written by
 * an older version of the app may carry neither (#32). Neither is worth losing a load over — a list
 * shows the name and sorts by the date — so they are filled in.
 *
 * This is the library's own doing, not its storage's, as in `firearms.ts` and `components.ts`: a check
 * that lived in the IndexedDB wrapper alone was a check the tests never ran, and every entry reaches
 * the application through here whatever it was stored in.
 */
function checked(entry: LibraryEntry): LibraryEntry[] {
  const result = parseLoad(JSON.stringify(entry.load));
  if (!result.ok) return [];
  const name = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : (result.value.title || 'Untitled');
  const updatedAt = typeof entry.updatedAt === 'string' && entry.updatedAt !== '' ? entry.updatedAt : new Date(0).toISOString();
  // The revision is kept as stored, or left out: a save compares it with the stored one (save()).
  const { revision, ...rest } = entry;
  return [{ ...rest, load: result.value, name, updatedAt, ...(typeof revision === 'string' ? { revision } : {}) }];
}

/** Entries of one cartridge, by firearm. */
export interface CartridgeShelf {
  cartridge: string;
  firearms: Array<{ firearm: string; entries: LibraryEntry[] }>;
}

/**
 * The library as the maintainer browses it: by cartridge, then by firearm (the barrel's name, which GRT
 * users give their gun), then by powder and name. Cartridges and firearms in alphabetical order.
 */
export function shelves(entries: readonly LibraryEntry[]): CartridgeShelf[] {
  const byCartridge = new Map<string, Map<string, LibraryEntry[]>>();
  for (const entry of entries) {
    const cartridge = entry.load.cartridge.name.trim();
    const firearm = entry.load.barrel.name.trim();
    const firearms = byCartridge.get(cartridge) ?? new Map<string, LibraryEntry[]>();
    firearms.set(firearm, [...(firearms.get(firearm) ?? []), entry]);
    byCartridge.set(cartridge, firearms);
  }
  const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const powder = (entry: LibraryEntry) => `${entry.load.propellant.maker} ${entry.load.propellant.product}`;
  return [...byCartridge]
    .sort(([a], [b]) => compare(a, b))
    .map(([cartridge, firearms]) => ({
      cartridge,
      firearms: [...firearms]
        .sort(([a], [b]) => compare(a, b))
        .map(([firearm, list]) => ({
          firearm,
          entries: [...list].sort((a, b) => compare(powder(a), powder(b)) || compare(a.name, b.name)),
        })),
    }));
}
