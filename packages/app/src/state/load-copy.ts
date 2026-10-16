import type { Load } from '@gordons-legacy/formats';
import type { OpenDocument } from './documents.ts';
import type { LibraryEntry } from './library-storage.ts';

/** A source offered by New → Clone, with open edits taking precedence over a saved snapshot. */
export interface CloneSource {
  id: string;
  name: string;
  load: Load;
  origin: 'open' | 'library';
}

export function cloneSources(documents: readonly OpenDocument[], library: readonly LibraryEntry[]): CloneSource[] {
  const openIds = new Set(documents.map((document) => document.libraryId));
  return [
    ...documents.map((document): CloneSource => ({ id: `open:${document.id}`, name: document.name.replace(/\.json$/i, ''), load: document.load, origin: 'open' })),
    ...library.filter((entry) => !openIds.has(entry.id)).map((entry): CloneSource => ({ id: `library:${entry.id}`, name: entry.name, load: entry.load, origin: 'library' })),
  ];
}

/**
 * Copies inputs into an independent document. Measurements, targets, notes and imported-file
 * metadata belong to the original; a powder's calibration record stays with its fitted parameters.
 */
export function copyLoadInputs(original: Load, title: string): Load {
  const { measurements: _measurements, pictures: _pictures, notes: _notes, shotGroups: _groups,
    importedFrom: _origin, unmapped: _unmapped, ...inputs } = structuredClone(original);
  return { ...inputs, title, measurements: [], pictures: [], notes: [] };
}
