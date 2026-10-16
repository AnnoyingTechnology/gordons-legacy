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
  /** Records successfully committed to storage. */
  added: number;
  /** Invalid records or failed writes; one for an unreadable/unsupported envelope. */
  failed: number;
}

export async function readBackup(text: string, library: Library, firearms: FirearmLibrary): Promise<RestoreResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { added: 0, failed: 1 };
  }
  // Validate the whole envelope before any writes, including the fields required by its version.
  if (!record(parsed) || parsed.format !== BACKUP_FORMAT || (parsed.version !== 1 && parsed.version !== BACKUP_VERSION)
    || !Array.isArray(parsed.loads) || (parsed.version === 2 && !Array.isArray(parsed.firearms))) {
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
  for (const item of (parsed.version === 2 && Array.isArray(parsed.firearms) ? parsed.firearms : [])) {
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
  return { added, failed };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
