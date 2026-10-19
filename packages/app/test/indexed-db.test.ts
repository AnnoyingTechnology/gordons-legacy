import { expect, test, vi } from 'vitest';
import { indexedDbStore, keyedRecords } from '../src/state/indexed-db.ts';

/** Manual event delivery separates request success from the transaction's eventual outcome. */
function databaseEvents() {
  const request = { result: undefined, error: null } as unknown as IDBRequest;
  const transaction = {
    error: null,
    objectStore: () => ({ put: () => request, delete: () => request, getAll: () => request }),
  } as unknown as IDBTransaction;
  const connection = { transaction: () => transaction, close: vi.fn() } as unknown as IDBDatabase;
  const opening = { result: connection, error: new DOMException('Storage unavailable', 'UnknownError') } as unknown as IDBOpenDBRequest;
  const factory = { open: vi.fn(() => opening) } as unknown as IDBFactory;
  return { request, transaction, connection, opening, factory };
}

async function connected(events: ReturnType<typeof databaseEvents>) {
  events.opening.onsuccess?.call(events.opening, new Event('success'));
  await Promise.resolve();
}

test('a successful request stays pending until its transaction commits', async () => {
  const events = databaseEvents();
  const store = indexedDbStore<{ id: string }>('components', events.factory);
  const finished = vi.fn();
  const saving = store.put({ id: 'new' }).then(finished);
  await connected(events);
  events.request.onsuccess?.call(events.request, new Event('success'));
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  events.transaction.oncomplete?.call(events.transaction, new Event('complete'));
  await saving;
  expect(finished).toHaveBeenCalledOnce();
});

test('an abort after request success rejects instead of reporting a saved record', async () => {
  const events = databaseEvents();
  const store = indexedDbStore<{ id: string }>('components', events.factory);
  const saving = store.put({ id: 'new' });
  const failed = expect(saving).rejects.toMatchObject({ name: 'AbortError' });
  await connected(events);
  events.request.onsuccess?.call(events.request, new Event('success'));
  events.transaction.onabort?.call(events.transaction, new Event('abort'));
  await failed;
});

test('a failed database open can be retried without reloading the app', async () => {
  const events = databaseEvents();
  const store = indexedDbStore<{ id: string }>('components', events.factory);
  const first = store.put({ id: 'new' });
  const failed = expect(first).rejects.toMatchObject({ name: 'UnknownError' });
  events.opening.onerror?.call(events.opening, new Event('error'));
  await failed;
  const retry = store.put({ id: 'new' });
  expect(events.factory.open).toHaveBeenCalledTimes(2);
  await connected(events);
  events.transaction.oncomplete?.call(events.transaction, new Event('complete'));
  await retry;
});

test('a version change closes the old connection and later operations reopen it', async () => {
  const events = databaseEvents();
  const store = indexedDbStore<{ id: string }>('components', events.factory);
  const first = store.put({ id: 'new' });
  await connected(events);
  events.transaction.oncomplete?.call(events.transaction, new Event('complete'));
  await first;
  events.connection.onversionchange?.call(events.connection, new Event('versionchange') as IDBVersionChangeEvent);
  expect(events.connection.close).toHaveBeenCalledOnce();
  const retry = store.remove('new');
  expect(events.factory.open).toHaveBeenCalledTimes(2);
  await connected(events);
  events.transaction.oncomplete?.call(events.transaction, new Event('complete'));
  await retry;
});

/**
 * What `getAll()` returns is whatever is in the store: a record written by an older version of the
 * application, or one damaged on disk. The `id` is the key everything downstream removes, replaces and
 * renders by, so a value without one is dropped here rather than throwing inside the promise a whole
 * library waits on — one bad record would empty a user's library instead of itself (#32).
 */
test('only records with a usable key come out of a store', () => {
  const kept = { id: 'a', name: 'kept' };
  expect(keyedRecords([kept, null, undefined, 'a string', 42, [], {}, { id: 7 }, { id: '' }, { id: 'b' }])).toEqual([kept, { id: 'b' }]);
});
