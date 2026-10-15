import { importGrtLoad, parseLoad, type Load } from '@gordons-legacy/formats';
import type { LibraryEntry, LibraryStorage } from './library-storage.ts';

export type { LibraryEntry } from './library-storage.ts';

/**
 * The user's own loads, kept in the browser, so that loads are saved and found without managing files
 * (issue #12). Listeners are told after every change.
 */
export class Library {
  entries: LibraryEntry[] = [];
  /** Settles once the stored entries are read. */
  readonly ready: Promise<void>;
  private readonly storage: LibraryStorage;
  private readonly listeners = new Set<() => void>();

  constructor(storage: LibraryStorage) {
    this.storage = storage;
    this.ready = storage.list().then((entries) => {
      this.entries = entries;
      this.changed();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(id: string): LibraryEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  /** Saves a load under `id`, or as a new entry; returns the entry's id. */
  async save(name: string, load: Load, id: string = newId()): Promise<string> {
    const entry: LibraryEntry = { id, name, load, updatedAt: new Date().toISOString() };
    await this.storage.put(entry);
    this.entries = [...this.entries.filter((candidate) => candidate.id !== id), entry];
    this.changed();
    return id;
  }

  async remove(id: string): Promise<void> {
    await this.storage.remove(id);
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.changed();
  }

  /**
   * Adds loads from files (`.grtload` or saved `.json`); returns the names of those that couldn't be
   * read. A GRT folder can come in at once.
   */
  async importFiles(files: Array<{ name: string; text: string }>): Promise<string[]> {
    const failed: string[] = [];
    for (const { name, text } of files) {
      const isGrt = name.toLowerCase().endsWith('.grtload');
      const result = isGrt ? importGrtLoad(text, { fileName: name }) : parseLoad(text);
      if (result.ok) await this.save(name.replace(/\.(grtload|json)$/i, ''), result.value);
      else failed.push(name);
    }
    return failed;
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

function newId(): string {
  return crypto.randomUUID();
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
