import { checkFirearm, parseLoad, serializeLoad } from '@gordons-legacy/formats';
import type { FirearmEntry, FirearmLibrary } from './firearms.ts';
import type { Library, LibraryEntry } from './library.ts';

/**
 * The user's own data in one file: every load of the library and every gun. It is what stands between
 * the user and a browser that clears its storage, so it carries everything the browser holds.
 *
 * Version 1 held loads only; it still restores, without guns.
 */
export const BACKUP_FORMAT = 'gordons-legacy.library';
export const BACKUP_VERSION = 2;

export function writeBackup(loads: readonly LibraryEntry[], firearms: readonly FirearmEntry[]): string {
  const document = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    loads: loads.map(({ name, updatedAt, load }) => ({ name, updatedAt, load: JSON.parse(serializeLoad(load)) as unknown })),
    firearms: firearms.map(({ updatedAt, firearm }) => ({ updatedAt, firearm })),
  };
  return JSON.stringify(document, null, 1);
}

/** What a restore did: everything is added as new entries, nothing is overwritten. */
export interface RestoreResult {
  added: number;
  failed: number;
}

export async function readBackup(text: string, library: Library, firearms: FirearmLibrary): Promise<RestoreResult> {
  let parsed: { format?: unknown; loads?: unknown; firearms?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return { added: 0, failed: 1 };
  }
  if (parsed.format !== BACKUP_FORMAT || !Array.isArray(parsed.loads)) return { added: 0, failed: 1 };
  let added = 0;
  let failed = 0;
  for (const item of parsed.loads as Array<{ name?: unknown; load?: unknown }>) {
    const result = parseLoad(JSON.stringify(item.load));
    if (result.ok && typeof item.name === 'string') {
      await library.save(item.name, result.value);
      added++;
    } else {
      failed++;
    }
  }
  for (const item of (Array.isArray(parsed.firearms) ? parsed.firearms : []) as Array<{ firearm?: unknown }>) {
    const result = checkFirearm(item.firearm);
    if (result.ok) {
      await firearms.save(result.value);
      added++;
    } else {
      failed++;
    }
  }
  return { added, failed };
}
