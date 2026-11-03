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
    store.markSaved(store.active!.id, serializeLoad(load), { id: 'entry' });
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

describe('undo, redo and reopening a closed load', () => {
  /** A clock the test moves by hand, so that merging quick edits is checked without waiting. */
  function clock() {
    let time = 0;
    return { now: () => time, advance: (ms: number) => (time += ms) };
  }
  const load = exampleLoad({ title: 'Load', note: '' })!;
  const withCharge = (grains: number) => ({ ...load, charge: { ...load.charge, mass: grains * 64.79891e-6 } });

  it('merges quick edits typed in a field into one step, and separates slow ones', () => {
    const time = clock();
    const store = new DocumentStore(undefined, time.now);
    store.openNew('Load.json', load);
    const id = store.active!.id;
    store.update(id, withCharge(2), 'charge');
    time.advance(200);
    store.update(id, withCharge(2.8), 'charge');
    time.advance(200);
    store.update(id, withCharge(2.85), 'charge');
    time.advance(5000);
    store.update(id, withCharge(3), 'charge');
    store.undo(id);
    expect(store.active!.load).toEqual(withCharge(2.85));
    store.undo(id);
    expect(store.active!.load).toEqual(load);
    expect(store.canUndo(id)).toBe(false);
    store.redo(id);
    store.redo(id);
    expect(store.active!.load).toEqual(withCharge(3));
    expect(store.canRedo(id)).toBe(false);
  });

  it('keeps a deliberate replacement as its own step, and a new change clears Redo', () => {
    const time = clock();
    const store = new DocumentStore(undefined, time.now);
    store.openNew('Load.json', load);
    const id = store.active!.id;
    store.update(id, withCharge(2), 'charge');
    store.update(id, withCharge(2.5));
    store.undo(id);
    expect(store.active!.load).toEqual(withCharge(2));
    expect(store.canRedo(id)).toBe(true);
    store.update(id, withCharge(4));
    expect(store.canRedo(id)).toBe(false);
  });

  it('never merges keystrokes of two different inputs, however quick', () => {
    const store = new DocumentStore(undefined, () => 0);
    store.openNew('Load.json', load);
    const id = store.active!.id;
    store.update(id, withCharge(2), 'charge');
    store.update(id, { ...withCharge(2), title: 'Other' }, 'title');
    store.undo(id);
    expect(store.active!.load).toEqual(withCharge(2));
  });

  it('reopens a load under its own id, and records a save that finished after it closed', () => {
    const store = new DocumentStore();
    store.openSaved('Load.json', load, 'entry');
    const id = store.active!.id;
    store.update(id, withCharge(2));
    store.close(id);
    store.markSaved(id, serializeLoad(withCharge(2)), { id: 'entry' });
    store.reopenClosed();
    expect(store.active!.id).toBe(id);
    expect(store.isDirty(store.active!)).toBe(false);
  });

  it('undoes a rename, name and title together', () => {
    const store = new DocumentStore();
    store.openNew('Load.json', load);
    const id = store.active!.id;
    store.rename(id, 'Renamed');
    store.undo(id);
    expect(store.active!.name).toBe('Load.json');
    expect(store.active!.load.title).toBe('Load');
  });

  it('reopens the last closed load with its unsaved changes and its history', () => {
    const store = new DocumentStore();
    store.openSaved('Load.json', load, 'entry');
    const id = store.active!.id;
    store.update(id, withCharge(2));
    store.close(id);
    expect(store.documents).toHaveLength(0);
    expect(store.canReopen).toBe(true);
    store.reopenClosed();
    const reopened = store.active!;
    expect(reopened.load).toEqual(withCharge(2));
    expect(reopened.libraryId).toBe('entry');
    expect(store.isDirty(reopened)).toBe(true);
    store.undo(reopened.id);
    expect(store.active!.load).toEqual(load);
    expect(store.canReopen).toBe(false);
  });

  it('reopens as an unsaved copy when its library entry is open in another tab', () => {
    const store = new DocumentStore();
    store.openSaved('Load.json', load, 'entry');
    store.close(store.active!.id);
    store.openSaved('Load.json', load, 'entry');
    store.reopenClosed();
    expect(store.documents.filter((document) => document.libraryId === 'entry')).toHaveLength(1);
    expect(store.isDirty(store.active!)).toBe(true);
  });
});

describe('undo shortcuts leave text fields their own undo', () => {
  const key = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: true, metaKey: false,
    altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false, ...modifiers });
  it('undoes and redoes outside a text field only', () => {
    expect(documentShortcut(key('z'), true)).toBe('undo');
    expect(documentShortcut(key('z', { ctrlKey: false, metaKey: true }), true)).toBe('undo');
    expect(documentShortcut(key('Z', { shiftKey: true }), true)).toBe('redo');
    expect(documentShortcut(key('y'), true)).toBe('redo');
    expect(documentShortcut(key('z'), true, true)).toBeUndefined();
    expect(documentShortcut(key('z'), false)).toBeUndefined();
  });
  it('reopens with Alt/Option+Shift+T, leaving Ctrl/Cmd+Shift+T to the browser', () => {
    expect(documentShortcut(key('t', { ctrlKey: false, altKey: true, shiftKey: true }), true)).toBe('reopen');
    expect(documentShortcut(key('t', { shiftKey: true }), true)).toBeUndefined();
  });
});
