import { expect, test } from 'vitest';
import { DocumentStore } from '../src/state/documents.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { claimRecovery } from '../src/state/recovery-lock.ts';

/** The open loads are kept for recovery by one tab of the app at a time (#32). */

function memoryLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

/** Web Locks in one page: a held lock is granted to the next request when its holder lets go. */
function fakeLocks() {
  let held = false;
  const waiting: Array<() => void> = [];
  const releases: Array<() => void> = [];
  const locks = {
    request: (async (_name: string, ...rest: unknown[]) => {
      const callback = rest.at(-1) as (lock: unknown) => Promise<unknown> | unknown;
      const options = rest.length > 1 ? (rest[0] as { ifAvailable?: boolean }) : {};
      if (held && options.ifAvailable) return callback(null);
      if (held) await new Promise<void>((resolve) => waiting.push(resolve));
      held = true;
      releases.push(() => {
        held = false;
        waiting.shift()?.();
      });
      void callback({});
    }) as LockManager['request'],
  } as LockManager;
  return { locks, closeHolder: () => releases.shift()?.() };
}

const load = exampleLoad({ title: 'Load', note: '' })!;

test("a second tab neither reads nor wipes the first tab's recovery, and adopts it when that tab closes", async () => {
  const storage = memoryLocalStorage();
  const { locks, closeHolder } = fakeLocks();
  const first = new DocumentStore(storage, Date.now, 'deferred');
  claimRecovery(first, locks);
  await Promise.resolve();
  first.openNew('Unsaved.json', load);

  const second = new DocumentStore(storage, Date.now, 'deferred');
  claimRecovery(second, locks);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(second.recoveryElsewhere).toBe(true);
  expect(second.documents).toHaveLength(0);
  second.openNew('Other.json', load);
  second.close(second.active!.id);
  // The first tab's unsaved load is still what a reload would recover.
  const reloaded = new DocumentStore(storage);
  expect(reloaded.documents.map((document) => document.name)).toEqual(['Unsaved.json']);

  closeHolder();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(second.recoveryElsewhere).toBe(false);
  expect(second.documents.map((document) => document.name)).toEqual(['Unsaved.json']);
});

test("a load the other tab had open from an entry open here too comes in as an unsaved copy, not a second link (#32)", async () => {
  const storage = memoryLocalStorage();
  const { locks, closeHolder } = fakeLocks();
  const first = new DocumentStore(storage, Date.now, 'deferred');
  claimRecovery(first, locks);
  await Promise.resolve();
  first.openSaved('Saved.json', load, 'entry-1', 'revision-1');
  const second = new DocumentStore(storage, Date.now, 'deferred');
  claimRecovery(second, locks);
  await new Promise((resolve) => setTimeout(resolve, 0));
  second.openSaved('Saved.json', load, 'entry-1', 'revision-1');
  closeHolder();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(second.documents.map((document) => document.libraryId)).toEqual(['entry-1', undefined]);
  expect(second.isDirty(second.documents[1]!)).toBe(true);
});
