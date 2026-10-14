import { importGrtLoad, parseLoad, serializeLoad, type ImportIssue, type Load } from '@gordons-legacy/formats';

/** A load open in a tab. */
export interface OpenDocument {
  id: number;
  /** File name shown in the tab. */
  name: string;
  load: Load;
  /** The load as last saved or opened, to tell whether it has unsaved changes. */
  savedText: string;
  /** Issues found when the file was imported. */
  issues: ImportIssue[];
}

const STORAGE_KEY = 'gordons-legacy.documents';

/**
 * The loads open in the application, and which one is shown. Listeners are told after every change;
 * the open loads are kept in the browser's storage so that a reload loses nothing.
 */
export class DocumentStore {
  documents: OpenDocument[] = [];
  activeId: number | undefined;
  /** True when the open loads no longer fit in the browser's storage and must be saved to files. */
  storageFull = false;
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  private readonly storage: Storage | undefined;

  constructor(storage?: Storage) {
    this.storage = storage;
    this.restore();
  }

  get active(): OpenDocument | undefined {
    return this.documents.find((document) => document.id === this.activeId);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Opens a `.grtload` or saved JSON load from its text. Returns the issues when it can't be read. */
  open(name: string, text: string): { ok: boolean; issues: ImportIssue[] } {
    const isGrt = name.toLowerCase().endsWith('.grtload');
    const result = isGrt ? importGrtLoad(text, { fileName: name }) : parseLoad(text);
    if (!result.ok) return { ok: false, issues: result.issues };
    const jsonName = isGrt ? name.replace(/\.grtload$/i, '.json') : name;
    // An imported GRT file counts as unsaved until saved in our format.
    const savedText = isGrt ? '' : serializeLoad(result.value);
    const document: OpenDocument = { id: this.nextId++, name: jsonName, load: result.value, savedText, issues: result.issues };
    this.documents = [...this.documents, document];
    this.activeId = document.id;
    this.changed();
    return { ok: true, issues: result.issues };
  }

  /** Opens a load made in the application (a calibrated copy…) in a new tab, unsaved. */
  openNew(name: string, load: Load): void {
    const document: OpenDocument = { id: this.nextId++, name, load, savedText: '', issues: [] };
    this.documents = [...this.documents, document];
    this.activeId = document.id;
    this.changed();
  }

  /** Replaces a document's load (after an edit). */
  update(id: number, load: Load): void {
    this.documents = this.documents.map((document) => (document.id === id ? { ...document, load } : document));
    this.changed();
  }

  /** Records that a document was saved with the given name. */
  markSaved(id: number, name: string): void {
    this.documents = this.documents.map((document) =>
      document.id === id ? { ...document, name, savedText: serializeLoad(document.load) } : document,
    );
    this.changed();
  }

  isDirty(document: OpenDocument): boolean {
    return serializeLoad(document.load) !== document.savedText;
  }

  activate(id: number): void {
    this.activeId = id;
    this.changed();
  }

  close(id: number): void {
    const index = this.documents.findIndex((document) => document.id === id);
    this.documents = this.documents.filter((document) => document.id !== id);
    if (this.activeId === id) this.activeId = this.documents[Math.min(index, this.documents.length - 1)]?.id;
    this.changed();
  }

  private changed(): void {
    this.persist();
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    const saved = this.documents.map(({ name, load, savedText }) => ({ name, load, savedText }));
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ documents: saved, active: this.documents.findIndex((d) => d.id === this.activeId) }));
      this.storageFull = false;
    } catch {
      // The browser's storage is full (large pictures): the loads stay open, but only a saved file keeps them.
      this.storageFull = true;
    }
  }

  private restore(): void {
    const text = this.storage?.getItem(STORAGE_KEY);
    if (!text) return;
    try {
      const saved = JSON.parse(text) as { documents: { name: string; load: Load; savedText: string }[]; active: number };
      for (const { name, load, savedText } of saved.documents) {
        const checked = parseLoad(JSON.stringify(load));
        if (checked.ok) this.documents.push({ id: this.nextId++, name, load: checked.value, savedText, issues: [] });
      }
      this.activeId = this.documents[saved.active]?.id ?? this.documents[0]?.id;
    } catch {
      // Unreadable storage: start empty rather than fail.
    }
  }
}
