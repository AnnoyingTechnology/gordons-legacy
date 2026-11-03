import { describe, expect, it } from 'vitest';
import { readBackup, writeBackup } from '../src/state/backup.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { FirearmLibrary, newFirearm, type FirearmEntry } from '../src/state/firearms.ts';
import { memoryStore } from '../src/state/indexed-db.ts';
import { EntryConflict } from '../src/state/entry-revision.ts';
import { batchUses, Inventory, lowStock, type StockItem } from '../src/state/inventory.ts';
import { Library } from '../src/state/library.ts';
import { memoryStorage } from '../src/state/library-storage.ts';

/** The stock (issues #10, #21): what is on the shelf, what a batch takes off it, what to buy again. */

const load = exampleLoad({ title: 'Load', note: '' })!;
const powderName = `${load.propellant.maker} ${load.propellant.product}`;

async function inventory(): Promise<Inventory> {
  const stock = new Inventory(memoryStore<StockItem>(), () => new Date('2026-11-02T12:00:00Z'));
  await stock.ready;
  return stock;
}

describe('the stock', () => {
  it('takes a batch off the shelf: the powder by rounds × charge, the projectile one a round', async () => {
    const stock = await inventory();
    const powder = await stock.save({ kind: 'powder', name: powderName.toUpperCase(), quantity: 0.454 });
    const bullet = await stock.save({ kind: 'projectile', name: load.projectile.name, quantity: 100 });
    await stock.save({ kind: 'primer', name: 'CCI 200', quantity: 1000 });
    const uses = batchUses(load, 50, stock.entries);
    expect(uses).toEqual([
      { id: powder, amount: 50 * load.charge.mass },
      { id: bullet, amount: 50 },
    ]);
    await stock.use(uses);
    expect(stock.entries.find((item) => item.id === bullet)!.quantity).toBe(50);
    expect(stock.entries.find((item) => item.id === powder)!.quantity).toBeCloseTo(0.454 - 50 * load.charge.mass, 12);
  });

  it('never counts below zero', async () => {
    const stock = await inventory();
    const id = await stock.save({ kind: 'case', name: 'Lapua .308', quantity: 20 });
    await stock.use([{ id, amount: 50 }]);
    expect(stock.entries[0]!.quantity).toBe(0);
  });

  it('lists what is at or below its low-stock level', async () => {
    const stock = await inventory();
    await stock.save({ kind: 'primer', name: 'CCI 200', quantity: 100, lowStock: 100 });
    await stock.save({ kind: 'primer', name: 'Federal 210', quantity: 500, lowStock: 100 });
    await stock.save({ kind: 'case', name: 'Lapua .308', quantity: 0 });
    expect(lowStock(stock.entries).map((item) => item.name)).toEqual(['CCI 200']);
  });

  it('drops a stored item that is not one, and keeps the rest', async () => {
    const storage = memoryStore<StockItem>();
    await storage.put({ id: 'a', kind: 'powder', name: 'N140', quantity: 0.5, updatedAt: '' });
    await storage.put({ id: 'b', kind: 'gunpowder' as never, name: 'N150', quantity: 0.5, updatedAt: '' });
    await storage.put({ id: 'c', kind: 'primer', name: 'CCI', quantity: Number.NaN, updatedAt: '' });
    const stock = new Inventory(storage);
    await stock.ready;
    expect(stock.entries.map((item) => item.id)).toEqual(['a']);
  });

  it('goes into the backup and comes back from it', async () => {
    const stock = await inventory();
    await stock.save({ kind: 'primer', name: 'CCI 200', quantity: 900, lowStock: 100 });
    const text = writeBackup([], [], stock.entries);
    const restored = await inventory();
    const library = new Library(memoryStorage());
    const firearms = new FirearmLibrary(memoryStore());
    expect(await readBackup(text, library, firearms, restored)).toEqual({ added: 1, failed: 0 });
    expect(restored.entries).toMatchObject([{ kind: 'primer', name: 'CCI 200', quantity: 900, lowStock: 100 }]);
  });
});

describe('a batch', () => {
  it('is taken off the shelf all at once or not at all', async () => {
    const storage = memoryStore<StockItem>();
    const stock = new Inventory(storage);
    await stock.ready;
    const powder = await stock.save({ kind: 'powder', name: 'N140', quantity: 0.5 });
    const bullets = await stock.save({ kind: 'projectile', name: 'SMK 168', quantity: 100 });
    storage.putAllIf = async () => {
      throw new Error('disk full');
    };
    await expect(stock.use([{ id: powder, amount: 0.1 }, { id: bullets, amount: 50 }])).rejects.toThrow('disk full');
    expect(stock.entries.map((item) => item.quantity).sort()).toEqual([0.5, 100]);
  });
});

describe('a store read slowly at startup (#32)', () => {
  it('keeps a gun written before its first reading returned', async () => {
    const storage = memoryStore<FirearmEntry>();
    const reading = Promise.withResolvers<FirearmEntry[]>();
    const list = storage.list.bind(storage);
    let first = true;
    storage.list = () => {
      if (!first) return list();
      first = false;
      return reading.promise;
    };
    const firearms = new FirearmLibrary(storage);
    const saving = firearms.save({ ...newFirearm(), name: 'Rhino 40DS' });
    reading.resolve([]);
    await saving;
    expect(firearms.entries.map((entry) => entry.firearm.name)).toEqual(['Rhino 40DS']);
  });
});

describe('the stock in two tabs (#32)', () => {
  it('counts two uses of one item as one use of their sum', async () => {
    const stock = await inventory();
    const id = await stock.save({ kind: 'primer', name: 'CCI 200', quantity: 100 });
    await stock.use([{ id, amount: 20 }, { id, amount: 30 }]);
    await stock.use([{ id, amount: 10 }]);
    expect(stock.entries[0]!.quantity).toBe(40);
  });

  it('never counts away a batch another tab recorded, and shows the stored count to try again from', async () => {
    const storage = memoryStore<StockItem>();
    const thisTab = new Inventory(storage);
    const id = await thisTab.save({ kind: 'primer', name: 'CCI 200', quantity: 100 });
    const otherTab = new Inventory(storage);
    await otherTab.ready;
    await otherTab.use([{ id, amount: 50 }]);
    await expect(thisTab.use([{ id, amount: 20 }])).rejects.toBeInstanceOf(EntryConflict);
    expect(thisTab.entries[0]!.quantity).toBe(50);
    await thisTab.use([{ id, amount: 20 }]);
    expect((await storage.list())[0]!.quantity).toBe(30);
  });

  it('refuses an edit of a count another tab changed', async () => {
    const storage = memoryStore<StockItem>();
    const thisTab = new Inventory(storage);
    const id = await thisTab.save({ kind: 'case', name: 'Lapua .308', quantity: 100 });
    const shown = thisTab.entries[0]!;
    const otherTab = new Inventory(storage);
    await otherTab.ready;
    await otherTab.save({ ...otherTab.entries[0]!, quantity: 80 });
    await expect(thisTab.save({ ...shown, quantity: 120 })).rejects.toBeInstanceOf(EntryConflict);
    expect((await storage.list())[0]!.quantity).toBe(80);
    expect(id).toBe(shown.id);
  });
});
