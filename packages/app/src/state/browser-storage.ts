/**
 * Reaching the browser's `localStorage`, which a browser is allowed to refuse (#32).
 *
 * `window.localStorage` is not a plain property: the HTML specification has it throw a `SecurityError`
 * when the document is not allowed to use it, and browsers do — Safari with cross-site tracking
 * prevention in a framed page, Chromium with "block all cookies", Firefox with cookies blocked for the
 * site. Reading the property is enough to throw, so a field initialised with `new DocumentStore(
 * window.localStorage)` took the whole application down before the first render: a user who blocks site
 * data saw an empty page instead of a tool that simply forgets.
 *
 * So the storage is asked for once, through a `try`, and the answer is nothing when the browser
 * refuses. Everything downstream already takes a `Storage | undefined`: the loads stay in memory for the
 * session, the settings fall back to the browser's language, and the shell says plainly that nothing
 * will be remembered.
 *
 * A storage that exists but refuses to *write* is a different matter and is not treated here: reads
 * from it are still worth having, and every write already goes through a `try` where it is made
 * (`documents.ts`, `settings.ts`).
 */

/** What the browser answered last time it was asked; `undefined` until the first question. */
let answer: { storage: Storage | undefined } | undefined;

/**
 * The browser's `localStorage`, or nothing when the browser refuses it. Asked once per session: the
 * answer cannot change while a page is open, and the question itself throws.
 *
 * `window` is read through `globalThis` so that a test or a non-browser run (the CLI, a worker) gets
 * nothing instead of a `ReferenceError`.
 */
export function browserStorage(): Storage | undefined {
  answer ??= { storage: reachableStorage() };
  return answer.storage;
}

function reachableStorage(): Storage | undefined {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage;
  } catch {
    // The browser is not letting this document use its storage; nothing is remembered this session.
    return undefined;
  }
}

/** Forgets the answer, so a test can ask again with another browser's behaviour. */
export function forgetStorageAnswer(): void {
  answer = undefined;
}

/** A value kept under `key`, or nothing — also when the browser refuses the read. */
export function remembered(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Keeps `value` under `key`; answers whether it was kept, since a browser may refuse the write. */
export function remember(storage: Storage | undefined, key: string, value: string): boolean {
  try {
    storage?.setItem(key, value);
    return storage !== undefined;
  } catch {
    return false;
  }
}
