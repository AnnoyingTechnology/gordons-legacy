import type { Load } from '@gordons-legacy/formats';
import type { RecordStore } from './indexed-db.ts';

/**
 * The reloader's stock (issues #10 and #21): powders, primers, projectiles and cases, each with the
 * quantity on the shelf and the level under which it should be bought again. Recording a batch of a load
 * takes what the batch used off the shelf. It lives beside the library in the browser's storage and goes
 * into the same backup file.
 */

export type StockKind = 'powder' | 'primer' | 'projectile' | 'case';

export const STOCK_KINDS: readonly StockKind[] = ['powder', 'primer', 'projectile', 'case'];

/** One thing on the shelf. */
export interface StockItem {
  id: string;
  kind: StockKind;
  /** As the user names it; a powder or projectile named like a load's is matched to it. */
  name: string;
  /** Powder: kg. Primers, projectiles and cases: a count. */
  quantity: number;
  /** Same unit as the quantity: at or below it, the item is listed as low. Absent: never. */
  lowStock?: number;
  /** When the entry was last saved, ISO 8601. */
  updatedAt: string;
}

export type InventoryStorage = RecordStore<StockItem>;

/** One thing a batch used: the item and how much of it, in the item's unit. */
export interface Use {
  id: string;
  amount: number;
}

export class Inventory {
  entries: StockItem[] = [];
  /** Settles once the stored items are read. */
  readonly ready: Promise<void>;
  private readonly storage: InventoryStorage;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => Date;

  constructor(storage: InventoryStorage, now: () => Date = () => new Date()) {
    this.storage = storage;
    this.now = now;
    this.ready = storage.list().then((entries) => {
      this.entries = entries.flatMap(checked);
      this.changed();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Saves an item, new when it has no id yet; returns its id. */
  async save(item: Omit<StockItem, 'id' | 'updatedAt'> & { id?: string }): Promise<string> {
    const entry: StockItem = { ...item, id: item.id ?? crypto.randomUUID(), updatedAt: this.now().toISOString() };
    await this.storage.put(entry);
    this.entries = [...this.entries.filter((candidate) => candidate.id !== entry.id), entry];
    this.changed();
    return entry.id;
  }

  /**
   * Takes an item from another device (sync/), keeping its id and date: it replaces the local item of the
   * same id only when it is newer. Returns whether it was taken.
   */
  async receive(item: StockItem): Promise<boolean> {
    const [checkedItem] = checked(item);
    // Dates are compared as instants, and one that isn't a date is refused (library.ts, `receive`).
    const time = checkedItem ? Date.parse(checkedItem.updatedAt) : Number.NaN;
    if (!checkedItem || !Number.isFinite(time) || !(typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)))) return false;
    const local = this.entries.find((entry) => entry.id === checkedItem.id);
    if (local && Date.parse(local.updatedAt) >= time) return false;
    await this.storage.put(checkedItem);
    this.entries = [...this.entries.filter((entry) => entry.id !== checkedItem.id), checkedItem];
    this.changed();
    return true;
  }

  async remove(id: string): Promise<void> {
    await this.storage.remove(id);
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.changed();
  }

  /**
   * Takes a batch's uses off the shelf. A quantity never goes below zero: a shelf that held less than the
   * batch used was miscounted, and zero is the truth that remains.
   */
  async use(uses: readonly Use[]): Promise<void> {
    const updatedAt = this.now().toISOString();
    const changed = uses.flatMap(({ id, amount }) => {
      const item = this.entries.find((entry) => entry.id === id);
      return item && amount > 0 ? [{ ...item, quantity: Math.max(0, item.quantity - amount), updatedAt }] : [];
    });
    // All at once or not at all: a batch half taken off the shelf would be taken off again on a retry.
    await this.storage.putAll(changed);
    this.entries = this.entries.map((entry) => changed.find((item) => item.id === entry.id) ?? entry);
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The items at or below their low-stock level. */
export function lowStock(items: readonly StockItem[]): StockItem[] {
  return items.filter((item) => item.lowStock !== undefined && item.quantity <= item.lowStock);
}

/** Lower case, letters and digits only, to match `Hodgdon H4350` with `hodgdon h-4350`. */
function key(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * What a batch of `rounds` of a load uses, as far as the shelf's names tell: the powder named like the
 * load's (rounds × charge) and the projectile named like the load's (one a round). A load says nothing
 * of its primer or case, so those are left to the person recording the batch.
 */
export function batchUses(load: Load, rounds: number, items: readonly StockItem[]): Use[] {
  const powder = key(`${load.propellant.maker} ${load.propellant.product}`);
  const projectile = key(load.projectile.name);
  const uses: Use[] = [];
  const powderItem = items.find((item) => item.kind === 'powder' && key(item.name) === powder);
  if (powderItem) uses.push({ id: powderItem.id, amount: rounds * load.charge.mass });
  const projectileItem = items.find((item) => item.kind === 'projectile' && key(item.name) === projectile);
  if (projectileItem) uses.push({ id: projectileItem.id, amount: rounds });
  return uses;
}

/** A stored item, or nothing: an entry written by an older version or damaged on disk is checked (#32). */
function checked(entry: StockItem): StockItem[] {
  if (typeof entry !== 'object' || entry === null || typeof entry.id !== 'string' || entry.id === '') return [];
  const kind = STOCK_KINDS.includes(entry.kind) ? entry.kind : undefined;
  if (kind === undefined || typeof entry.name !== 'string' || !Number.isFinite(entry.quantity)) return [];
  const lowStock = typeof entry.lowStock === 'number' && Number.isFinite(entry.lowStock) ? entry.lowStock : undefined;
  const updatedAt = typeof entry.updatedAt === 'string' && entry.updatedAt !== '' ? entry.updatedAt : new Date(0).toISOString();
  return [{ id: entry.id, kind, name: entry.name, quantity: Math.max(0, entry.quantity), ...(lowStock === undefined ? {} : { lowStock }), updatedAt }];
}

/** A stored item as the backup carries it: everything but the store's own id. */
export function checkStockItem(value: unknown): Omit<StockItem, 'id' | 'updatedAt'> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const [item] = checked({ ...(value as StockItem), id: 'backup' });
  if (!item) return undefined;
  const { id: _id, updatedAt: _updatedAt, ...rest } = item;
  return rest;
}
