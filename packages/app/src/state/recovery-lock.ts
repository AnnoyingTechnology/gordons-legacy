import type { DocumentStore } from './documents.ts';

/** The Web Lock held by the tab that keeps the open loads for recovery. */
const LOCK = 'gordons-legacy.recovery';

/**
 * Lets one tab of the app at a time keep the open loads for recovery (#32). The first tab takes the
 * lock and holds it until it closes; another tab says that its loads are not kept, and takes the lock,
 * with the loads the first tab left, when that one closes. A reload releases the lock for a moment, so
 * a waiting tab may take over then: the reloaded tab's loads are not lost, they open in that one.
 * Without Web Locks (an old browser) every tab keeps the record, as before.
 */
export function claimRecovery(store: DocumentStore, locks: LockManager | undefined = globalThis.navigator?.locks): void {
  if (!locks) {
    store.takeRecovery();
    return;
  }
  const hold = () => {
    store.takeRecovery();
    // Never settled: the lock is held for as long as the tab lives.
    return new Promise<never>(() => {});
  };
  locks
    .request(LOCK, { ifAvailable: true }, (lock) => {
      if (lock) return hold();
      store.waitForRecovery();
      void locks.request(LOCK, hold);
      return undefined;
    })
    .catch(() => store.takeRecovery());
}
