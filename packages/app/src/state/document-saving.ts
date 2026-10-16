import { serializeLoad, type Load } from '@gordons-legacy/formats';
import type { DocumentStore } from './documents.ts';
import type { Library } from './library.ts';

/**
 * Saves each document's requested snapshots in order. A second first-save must wait for the library
 * id assigned by the first; otherwise a double click creates two entries. Other documents can save
 * independently. Failed writes reject normally and do not block a later retry.
 */
export function documentSaver(store: DocumentStore, library: Pick<Library, 'save'>): (id: number) => Promise<boolean> {
  const pending = new Map<number, Promise<boolean>>();
  return (id) => {
    const document = store.documents.find((candidate) => candidate.id === id);
    if (!document) return Promise.resolve(false);
    const name = document.name.replace(/\.json$/i, '');
    const savedText = serializeLoad(document.load);
    const load = JSON.parse(savedText) as Load;
    const previous = pending.get(id) ?? Promise.resolve(false);
    const saving = previous.catch(() => false).then(async () => {
      const current = store.documents.find((candidate) => candidate.id === id);
      if (!current) return false;
      const libraryId = await library.save(name, load, current.libraryId);
      store.markSaved(id, savedText, libraryId);
      return true;
    });
    pending.set(id, saving);
    return saving.finally(() => { if (pending.get(id) === saving) pending.delete(id); });
  };
}
