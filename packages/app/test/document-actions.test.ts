import { serializeLoad } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../src/state/documents.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { copyLoadInputs } from '../src/state/load-copy.ts';
import { documentShortcut } from '../src/state/keyboard-shortcuts.ts';

describe('document identity', () => {
  it('renames the tab and saved title together, without losing its library identity', () => {
    const store = new DocumentStore();
    const load = exampleLoad({ title: 'Original', note: '' })!;
    store.openSaved('Original.json', load, 'entry');
    store.rename(store.active!.id, ' Renamed.json ');
    expect(store.active!.name).toBe('Renamed.json');
    expect(store.active!.load.title).toBe('Renamed');
    expect(store.active!.libraryId).toBe('entry');
    expect(store.isDirty(store.active!)).toBe(true);
    store.markSaved(store.active!.id, serializeLoad(load), 'entry');
    expect(store.active!.name).toBe('Renamed.json');
    expect(store.isDirty(store.active!)).toBe(true);
    store.rename(store.active!.id, ' ');
    expect(store.active!.name).toBe('Renamed.json');
  });

  it('copies inputs without claiming the original measurements, targets or import origin', () => {
    const original = exampleLoad({ title: 'Original', note: 'Original notes' })!;
    original.importedFrom = { format: 'GRT', fileName: 'original.grtload' };
    original.shotGroups = [{ title: 'Original target', distance: 100, hits: [], note: '' }];
    const copied = copyLoadInputs(original, 'Copy');
    expect(copied.title).toBe('Copy');
    expect(copied.notes).toEqual([]);
    expect(copied.measurements).toEqual([]);
    expect(copied.pictures).toEqual([]);
    expect(copied.shotGroups).toBeUndefined();
    expect(copied.importedFrom).toBeUndefined();
    copied.barrel.name = 'Changed';
    expect(original.barrel.name).not.toBe('Changed');
    expect(original.notes).toHaveLength(1);
  });
});

describe('opt-in application shortcuts', () => {
  const key = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: true, metaKey: false,
    altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false, ...modifiers });
  it('leaves browser window/tab commands alone, even when opted in', () => {
    for (const value of ['n', 'w', 't', 'r']) expect(documentShortcut(key(value), true)).toBeUndefined();
    expect(documentShortcut(key('s'), false)).toBeUndefined();
  });
  it('recognizes save and the separate new/close combinations on either platform', () => {
    expect(documentShortcut(key('s'), true)).toBe('save');
    expect(documentShortcut(key('s', { ctrlKey: false, metaKey: true }), true)).toBe('save');
    expect(documentShortcut(key('N', { ctrlKey: false, altKey: true, shiftKey: true }), true)).toBe('new');
    expect(documentShortcut(key('w', { ctrlKey: false, altKey: true, shiftKey: true }), true)).toBe('close');
    expect(documentShortcut(key('symbol', { code: 'KeyW', ctrlKey: false, altKey: true, shiftKey: true }), true)).toBe('close');
  });
  it('ignores composition, repeats, handled events and extra modifiers', () => {
    for (const modifiers of [{ repeat: true }, { isComposing: true }, { defaultPrevented: true }, { shiftKey: true }, { metaKey: true }]) {
      expect(documentShortcut(key('s', modifiers), true)).toBeUndefined();
    }
  });
});
