import { afterEach, describe, expect, it } from 'vitest';
import { browserStorage, forgetStorageAnswer, remember, remembered } from '../src/state/browser-storage.ts';
import { loadSettings, saveSettings } from '../src/state/settings.ts';

/**
 * A browser is allowed to refuse its own storage (#32, browser-storage.ts). Reading
 * `window.localStorage` throws a `SecurityError` where site data is blocked — Safari in a framed page,
 * Chromium with all cookies blocked — and the application used to read it in a field initialiser, so a
 * user who blocks site data got an empty page rather than a tool that forgets.
 *
 * The storage below behaves like those browsers: one throws when the property is read, one throws on
 * every write, and one works.
 */
function workingStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function refusingWrites(): Storage {
  return {
    ...workingStorage(),
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
  };
}

/** A `globalThis.localStorage` that throws when it is read, as a browser blocking site data does. */
function denyStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
}

function allowStorage(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
}

afterEach(() => {
  forgetStorageAnswer();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('reaching the browser storage', () => {
  it('answers nothing where reading the property itself throws', () => {
    denyStorage();
    expect(browserStorage()).toBeUndefined();
  });

  it('answers the storage where the browser allows it', () => {
    const storage = workingStorage();
    allowStorage(storage);
    expect(browserStorage()).toBe(storage);
  });

  it('answers nothing outside a browser, where there is no such property', () => {
    expect(browserStorage()).toBeUndefined(); // the CLI and the test runner
  });

  it('asks the browser once: the answer cannot change while a page is open', () => {
    const storage = workingStorage();
    allowStorage(storage);
    expect(browserStorage()).toBe(storage);
    denyStorage();
    expect(browserStorage()).toBe(storage);
  });
});

describe('remembering a value', () => {
  it('keeps and reads a value where the storage works', () => {
    const storage = workingStorage();
    expect(remember(storage, 'welcome', '1')).toBe(true);
    expect(remembered(storage, 'welcome')).toBe('1');
  });

  it('says a value was not kept where the browser refuses the write', () => {
    expect(remember(refusingWrites(), 'welcome', '1')).toBe(false);
    expect(remember(undefined, 'welcome', '1')).toBe(false);
  });

  it('reads nothing rather than throwing where there is no storage', () => {
    expect(remembered(undefined, 'welcome')).toBeNull();
    expect(remembered(workingStorage(), 'welcome')).toBeNull();
  });
});

describe('settings in a browser that remembers nothing', () => {
  it('saves without throwing, so a changed unit does not break the click that changed it', () => {
    const settings = loadSettings(undefined, ['en']);
    expect(() => saveSettings(refusingWrites(), settings)).not.toThrow();
    expect(() => saveSettings(undefined, settings)).not.toThrow();
  });

  it('falls back to the browser language when nothing was ever saved', () => {
    expect(loadSettings(undefined, ['fr-FR', 'en']).language).toBe('fr');
  });
});
