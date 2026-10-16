import { describe, expect, it } from 'vitest';
import { documentSaver } from '../src/state/document-saving.ts';
import { DocumentStore } from '../src/state/documents.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { Library } from '../src/state/library.ts';
import { memoryStorage } from '../src/state/library-storage.ts';

const fixture = exampleLoad({ title: 'Original', note: '' })!;

describe('ordered document saves', () => {
  it('saves overlapping requests to one library entry and leaves subsequent edits dirty', async () => {
    const store = new DocumentStore();
    store.openNew('Original.json', fixture);
    const storage = memoryStorage();
    const originalPut = storage.put;
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let writes = 0;
    storage.put = async (entry) => {
      if (++writes === 1) { started.resolve(); await release.promise; }
      await originalPut(entry);
    };
    const library = new Library(storage);
    await library.ready;
    const save = documentSaver(store, library);
    const id = store.active!.id;
    const first = save(id);
    await started.promise;
    store.rename(id, 'Second requested snapshot');
    const second = save(id);
    store.rename(id, 'Later unsaved edit');
    expect(writes).toBe(1);
    release.resolve();
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(writes).toBe(2);
    expect(library.entries).toHaveLength(1);
    expect(library.entries[0]!.name).toBe('Second requested snapshot');
    expect(library.entries[0]!.load.title).toBe('Second requested snapshot');
    expect(store.active!.libraryId).toBe(library.entries[0]!.id);
    expect(store.isDirty(store.active!)).toBe(true);
    await save(id);
    expect(library.entries).toHaveLength(1);
    expect(store.isDirty(store.active!)).toBe(false);
  });

  it('allows retry after a failed write and ignores a missing document', async () => {
    const store = new DocumentStore();
    store.openNew('Original.json', fixture);
    const library = new Library(memoryStorage());
    await library.ready;
    const actualSave = library.save.bind(library);
    let fail = true;
    library.save = async (...args) => { if (fail) throw new Error('storage failure'); return actualSave(...args); };
    const save = documentSaver(store, library);
    await expect(save(store.active!.id)).rejects.toThrow('storage failure');
    expect(store.isDirty(store.active!)).toBe(true);
    fail = false;
    expect(await save(store.active!.id)).toBe(true);
    expect(store.isDirty(store.active!)).toBe(false);
    expect(await save(-1)).toBe(false);
  });
});
