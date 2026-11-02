import { checkFirearm, parseLoad, serializeLoad } from '@gordons-legacy/formats';
import type { FirearmEntry, FirearmLibrary } from './firearms.ts';
import { checkStockItem, type Inventory, type StockItem } from './inventory.ts';
import type { Library, LibraryEntry } from './library.ts';

/**
 * The user's own data in one file: every load of the library, every gun and the stock. It is what stands
 * between the user and a browser that clears its storage, so it carries everything the browser holds.
 *
 * Version 1 held loads only, version 2 loads and guns; both still restore.
 */
export const BACKUP_FORMAT = 'gordons-legacy.library';
export const BACKUP_VERSION = 3;

export function writeBackup(loads: readonly LibraryEntry[], firearms: readonly FirearmEntry[], stock: readonly StockItem[] = []): string {
  const document = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    loads: loads.map(({ name, updatedAt, load }) => ({ name, updatedAt, load: JSON.parse(serializeLoad(load)) as unknown })),
    firearms: firearms.map(({ updatedAt, firearm }) => ({ updatedAt, firearm })),
    stock: stock.map(({ id: _id, ...item }) => item),
  };
  return JSON.stringify(document, null, 1);
}

/** What a restore did: everything is added as new entries, nothing is overwritten. */
export interface RestoreResult {
  /** Records successfully committed to storage. */
  added: number;
  /** Invalid records or failed writes; one for an unreadable/unsupported envelope. */
  failed: number;
}

export async function readBackup(text: string, library: Library, firearms: FirearmLibrary, inventory?: Inventory): Promise<RestoreResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { added: 0, failed: 1 };
  }
  // Validate the whole envelope before any writes, including the fields required by its version.
  if (!record(parsed) || parsed.format !== BACKUP_FORMAT || (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3)
    || !Array.isArray(parsed.loads) || (parsed.version !== 1 && !Array.isArray(parsed.firearms))
    || (parsed.version === 3 && !Array.isArray(parsed.stock))) {
    return { added: 0, failed: 1 };
  }
  let added = 0;
  let failed = 0;
  for (const item of parsed.loads) {
    if (!record(item)) { failed++; continue; }
    const result = parseLoad(JSON.stringify(item.load));
    if (result.ok && typeof item.name === 'string') {
      try {
        await library.save(item.name, result.value);
        added++;
      } catch { failed++; }
    } else {
      failed++;
    }
  }
  for (const item of (parsed.version !== 1 && Array.isArray(parsed.firearms) ? parsed.firearms : [])) {
    if (!record(item)) { failed++; continue; }
    const result = checkFirearm(item.firearm);
    if (result.ok) {
      try {
        await firearms.save(result.value);
        added++;
      } catch { failed++; }
    } else {
      failed++;
    }
  }
  for (const item of (Array.isArray(parsed.stock) ? parsed.stock : [])) {
    const stockItem = checkStockItem(item);
    if (!stockItem || !inventory) { failed++; continue; }
    try {
      await inventory.save(stockItem);
      added++;
    } catch { failed++; }
  }
  return { added, failed };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
