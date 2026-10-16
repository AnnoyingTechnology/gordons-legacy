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
 * Letters and digits only, and without `mm`, so that the same cartridge written by two people compares
 * equal: `9x19 mm` and `9 mm Luger (9 x 19)` both hold `9x19`.
 *
 * A multiplication sign is a letter `x` first: `8×57` is `8x57`, and dropping it with the punctuation
 * would leave `857`, which is a case length no comparison could find.
 */
function normalise(text: string): string {
  return text.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]/g, '').replaceAll('mm', '');
}

/** The `9x19` of a name, when it has one: what two namings of the same cartridge share. */
function dimensions(name: string): string | undefined {
  return /\d+x\d+/.exec(name)?.[0];
}

/**
 * Whether a gun's maker says it is chambered for a cartridge, as far as two names written by different
 * people can say. Used only to put the likely guns first in the chooser, and shown as the maker's word,
 * never as a statement that the load suits the gun.
 *
 * A name that is only a calibre names no cartridge: Glock writes `.357` for .357 SIG, and `.357` is
 * equally the start of .357 Magnum — two cartridges that must never be offered for one another. Those
 * match nothing; the user picks their gun themselves. The same rule keeps `.45` away from .454 Casull.
 */
/**
 * The cartridges a gun's record names. A maker often prints two names for one chamber — Henry's
 * `.357 Magnum/.38 Spl`, FN's `.223 Rem/5.56 NATO` — and the record keeps the words as printed, so a
 * load of either is a load for that gun.
 *
 * Two spellings are one name and are never split: `.45/70` is how the older makers write `.45-70`, and
 * a comma between figures is a metric page's decimal (`7,62 x 39`).
 */
function names(cartridge: string): string[] {
  if (/^\s*\.?\d{2,3}\s*\/\s*\d{2,3}\s*$/.test(cartridge)) return [cartridge.trim()];
  return cartridge
    .split(/\/|;|(?<!\d),|,(?!\d)|\sor\s/i)
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

export function chamberedFor(firearm: Firearm, cartridge: string): boolean {
  const printed = firearm.cartridge ?? '';
  const parts = names(printed);
  if (parts.length > 1) return parts.some((name) => chamberedFor({ ...firearm, cartridge: name }, cartridge));
  const gun = normalise(printed);
  const load = normalise(cartridge);
  if (gun === '' || load === '') return false;
  if (gun === load) return true;
  // A bare calibre is ambiguous by construction, whichever side of the comparison it is on.
  if (/^\d+$/.test(gun) || /^\d+$/.test(load)) return false;
  const gunDimensions = dimensions(gun);
  const loadDimensions = dimensions(load);
  // `9x19 mm` against `9 mm Luger (9 x 19)`: when both name a case, the case decides.
  if (gunDimensions !== undefined && loadDimensions !== undefined) return gunDimensions === loadDimensions;
  return load.includes(gun) || gun.includes(load);
}

/**
 * The guns to choose from: those described in the library first, then the barrels named in saved loads
 * that no described gun covers (the most recently saved load gives their specifications), then the
 * makers' published ones (issue #30).
 *
 * The user's own always wins: a published gun of a name they have already described is left out, so that
 * a maker's nominal figures never push aside the gun they measured. With a cartridge, the guns whose
 * maker lists it come first — the maker's word, not a statement that the load suits the gun.
 */
export function choosableFirearms(
  firearms: readonly FirearmEntry[],
  loads: readonly LibraryEntry[],
  published: readonly Firearm[] = [],
  cartridge?: string,
): Firearm[] {
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
  const own = [...described, ...fromLoads];
  const ownNames = new Set(own.map((firearm) => firearm.name.trim().toLowerCase()));
  const byName = (a: Firearm, b: Firearm) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const all = [...own.sort(byName), ...published.filter((firearm) => !ownNames.has(firearm.name.trim().toLowerCase())).sort(byName)];
  if (cartridge === undefined) return all;
  // A stable sort keeps the user's guns ahead of the published ones within each of the two groups.
  return [...all.filter((firearm) => chamberedFor(firearm, cartridge)), ...all.filter((firearm) => !chamberedFor(firearm, cartridge))];
}

/** What a gun is called in a list: its name, or its maker and model when it has no name yet. */
export function firearmLabel(firearm: Firearm): string {
  const name = firearm.name.trim();
  if (name !== '') return name;
  return [firearm.maker, firearm.model].filter((part) => part && part.trim() !== '').join(' ');
}
