/**
 * Revisions of stored entries (#32). Every write of a library load or a gun gives it a new random
 * revision; an edit replaces the entry only while it is still stored at the revision the edit started
 * from, checked in the write's own transaction (`RecordStore.putIf`). Another tab of the app, or a
 * sync, may have saved or removed it since, and that is not undone unseen. A date is no revision: two
 * saves can share a millisecond.
 */

export function newRevision(): string {
  return crypto.randomUUID();
}

/** The revision of a stored record, read without trusting its shape; undefined for entries older than revisions. */
export function revisionOf(stored: unknown): string | undefined {
  const revision = (stored as { revision?: unknown } | undefined)?.revision;
  return typeof revision === 'string' ? revision : undefined;
}

/** Whether a stored record is still the one an edit started from: there, at that revision. */
export function isRevision(stored: unknown, revision: string | undefined): boolean {
  return stored !== undefined && revisionOf(stored) === revision;
}

/** A write refused because the entry changed or was removed since it was read. */
export class EntryConflict extends Error {
  /** The name of the load or gun, for the message shown. */
  readonly entryName: string;

  constructor(entryName: string) {
    super(`${entryName} changed or was removed since it was read.`);
    this.entryName = entryName;
  }
}
