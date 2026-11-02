import { describe, expect, it } from 'vitest';
import { readBackup, writeBackup } from '../src/state/backup.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { FirearmLibrary } from '../src/state/firearms.ts';
import { memoryStore } from '../src/state/indexed-db.ts';
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
