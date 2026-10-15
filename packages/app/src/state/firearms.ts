import { checkFirearm, FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm, type Load } from '@gordons-legacy/formats';
import type { RecordStore } from './indexed-db.ts';
import type { LibraryEntry } from './library-storage.ts';

/**
 * The user's guns (issue #24): described once, used by every load fired in them. They live beside the
 * loads in the browser's storage and go into the same backup file.
 *
 * A gun the user has not described yet may still appear in their loads, as the barrel's name; those are
 * offered too, so that nothing has to be entered twice.
 */

/** A gun as stored: the document, with the identity and date the store needs. */
export interface FirearmEntry {
  id: string;
  firearm: Firearm;
  /** When the entry was last saved, ISO 8601. */
  updatedAt: string;
}

export type FirearmStorage = RecordStore<FirearmEntry>;

export class FirearmLibrary {
  entries: FirearmEntry[] = [];
  /** Settles once the stored guns are read. */
  readonly ready: Promise<void>;
  private readonly storage: FirearmStorage;
  private readonly listeners = new Set<() => void>();

  constructor(storage: FirearmStorage) {
    this.storage = storage;
    this.ready = storage.list().then((entries) => {
      this.entries = entries.flatMap(checked);
      this.changed();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Saves a gun under `id`, or as a new entry; returns the entry's id. */
  async save(firearm: Firearm, id: string = crypto.randomUUID()): Promise<string> {
    const entry: FirearmEntry = { id, firearm, updatedAt: new Date().toISOString() };
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

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

function checked(entry: FirearmEntry): FirearmEntry[] {
  const result = checkFirearm(entry.firearm);
  return result.ok ? [{ ...entry, firearm: result.value }] : [];
}

/** An empty gun, to fill in: a barrel with nothing but a length the editor will ask for. */
export function newFirearm(): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: '',
    barrel: { name: '', length: 0.5, gasLeaks: [] },
  };
}

/** The gun a load was fired in, as its barrel describes it: what "save this barrel as a gun" starts from. */
export function firearmFromLoad(load: Load): Firearm {
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: load.barrel.name,
    ...(load.cartridge.name === '' ? {} : { cartridge: load.cartridge.name }),
    barrel: load.barrel,
  };
}

/** The load fired in that gun: the barrel is the gun's, under the gun's name. */
export function withFirearm(load: Load, firearm: Firearm): Load {
  return { ...load, barrel: { ...firearm.barrel, name: firearm.name } };
}

/**
 * The guns to choose from: those described in the library first, then the barrels named in saved loads
 * that no described gun covers (the most recently saved load gives their specifications).
 */
export function choosableFirearms(firearms: readonly FirearmEntry[], loads: readonly LibraryEntry[]): Firearm[] {
  const described = firearms.map((entry) => entry.firearm);
  const names = new Set(described.map((firearm) => firearm.name.trim().toLowerCase()));
  const latest = new Map<string, LibraryEntry>();
  for (const entry of loads) {
    const name = entry.load.barrel.name.trim();
    if (name === '' || names.has(name.toLowerCase())) continue;
    const known = latest.get(name);
    if (!known || known.updatedAt < entry.updatedAt) latest.set(name, entry);
  }
  const fromLoads = [...latest.values()].map((entry) => firearmFromLoad(entry.load));
  return [...described, ...fromLoads].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** What a gun is called in a list: its name, or its maker and model when it has no name yet. */
export function firearmLabel(firearm: Firearm): string {
  const name = firearm.name.trim();
  if (name !== '') return name;
  return [firearm.maker, firearm.model].filter((part) => part && part.trim() !== '').join(' ');
}
