import { serializeLoad } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../src/state/documents.ts';
import { exampleLoad } from '../src/state/example-load.ts';

const load = () => exampleLoad({ title: 'Document', note: 'Example' })!;

describe('document save snapshots', () => {
  it('keeps an edit made during an asynchronous save dirty', () => {
    const store = new DocumentStore();
    store.openNew('document.json', load());
    const saving = store.active!;
    const savedText = serializeLoad(saving.load);
    store.update(saving.id, { ...saving.load, title: 'Edited while saving' });
    store.markSaved(saving.id, savedText, 'library-entry');
    expect(store.active!.load.title).toBe('Edited while saving');
    expect(store.active!.savedText).toBe(savedText);
    expect(store.active!.libraryId).toBe('library-entry');
    expect(store.isDirty(store.active!)).toBe(true);
  });

  it('marks the unchanged snapshot clean and retains it across a reload', () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
    };
    const store = new DocumentStore(storage);
    store.openNew('document.json', load());
    store.markSaved(store.active!.id, serializeLoad(store.active!.load), 'entry');
    const restored = new DocumentStore(storage);
    expect(restored.isDirty(restored.active!)).toBe(false);
    expect(restored.active!.libraryId).toBe('entry');
  });

  it('does not reopen a document closed before its save finishes', () => {
    const store = new DocumentStore();
    store.openNew('document.json', load());
    const saving = store.active!;
    store.close(saving.id);
    store.markSaved(saving.id, serializeLoad(saving.load), 'entry');
    expect(store.documents).toEqual([]);
    expect(store.active).toBeUndefined();
  });
});
