import { isGrtLoadFile, parseLoad, readLoadFile, serializeLoad, type ImportIssue, type Load } from '@gordons-legacy/formats';
import { DocumentHistory } from './document-history.ts';

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
  /** The library entry the load is saved in, once saved there. */
  libraryId?: string;
}

const STORAGE_KEY = 'gordons-legacy.documents';

/** Closed loads kept for Reopen, most recent last. Like the Undo steps, they live in memory only. */
export const CLOSED_LIMIT = 10;

/** A closed load, as it was when closed, unsaved changes included. */
interface ClosedDocument {
  /** Kept whole, its id included: a save still running for it must finish on the same document. */
  document: OpenDocument;
  history: DocumentHistory;
}

/**
 * The loads open in the application, and which one is shown. Listeners are told after every change;
 * the open loads are kept in the browser's storage so that a reload loses nothing.
 */
export class DocumentStore {
  documents: OpenDocument[] = [];
  activeId: number | undefined;
  /** True when the open loads no longer fit in the browser's storage and must be saved to files. */
  storageFull = false;
  /** Some saved tabs were unreadable; keep this visible while the recovered session is open. */
  recoveryFailed = false;
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  private readonly storage: Storage | undefined;
  private readonly histories = new Map<number, DocumentHistory>();
  private closed: ClosedDocument[] = [];
  private readonly now: () => number;

  /** `now` is the clock that merges quick edits into one Undo step; tests pass their own. */
  constructor(storage?: Storage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
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
    const isGrt = isGrtLoadFile(name);
    const result = readLoadFile(name, text);
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

  /** Opens a load from the library, or shows its tab when it is already open. */
  openSaved(name: string, load: Load, libraryId: string): void {
    const open = this.documents.find((document) => document.libraryId === libraryId);
    if (open) {
      this.activate(open.id);
      return;
    }
    const document: OpenDocument = { id: this.nextId++, name, load, savedText: serializeLoad(load), issues: [], libraryId };
    this.documents = [...this.documents, document];
    this.activeId = document.id;
    this.changed();
  }

  /**
   * Replaces a document's load, as one Undo step. `typing` names the input when the change is a
   * keystroke: quick keystrokes in one input merge into a single step (state/load-change.ts).
   */
  update(id: number, load: Load, typing?: string): void {
    const document = this.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    this.historyOf(id).record({ name: document.name, load: document.load }, typing);
    this.documents = this.documents.map((candidate) => (candidate.id === id ? { ...candidate, load } : candidate));
    this.changed();
  }

  /** Changes the tab/file name and the title saved inside the load together, as one Undo step. */
  rename(id: number, title: string): void {
    const trimmed = title.trim().replace(/\.json$/i, '').trim();
    const document = this.documents.find((candidate) => candidate.id === id);
    if (!trimmed || !document) return;
    this.historyOf(id).record({ name: document.name, load: document.load });
    this.documents = this.documents.map((candidate) => candidate.id === id
      ? { ...candidate, name: `${trimmed}.json`, load: { ...candidate.load, title: trimmed } }
      : candidate);
    this.changed();
  }

  canUndo(id: number): boolean {
    return this.histories.get(id)?.canUndo ?? false;
  }

  canRedo(id: number): boolean {
    return this.histories.get(id)?.canRedo ?? false;
  }

  /** Returns the document to its state before the last change. A saved document may become unsaved. */
  undo(id: number): void {
    this.travel(id, (history, current) => history.undo(current));
  }

  redo(id: number): void {
    this.travel(id, (history, current) => history.redo(current));
  }

  private travel(id: number, step: (history: DocumentHistory, current: { name: string; load: Load }) => { name: string; load: Load } | undefined): void {
    const document = this.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    const target = step(this.historyOf(id), { name: document.name, load: document.load });
    if (!target) return;
    this.documents = this.documents.map((candidate) => (candidate.id === id ? { ...candidate, name: target.name, load: target.load } : candidate));
    this.changed();
  }

  private historyOf(id: number): DocumentHistory {
    let history = this.histories.get(id);
    if (!history) {
      history = new DocumentHistory(this.now);
      this.histories.set(id, history);
    }
    return history;
  }

  /**
   * Records the exact snapshot written, so an edit made while saving remains unsaved. A save that
   * finishes after its tab was closed is recorded on the closed load too, for Reopen.
   */
  markSaved(id: number, savedText: string, libraryId?: string): void {
    const saved = (document: OpenDocument) => (document.id === id ? { ...document, savedText, ...(libraryId === undefined ? {} : { libraryId }) } : document);
    this.documents = this.documents.map(saved);
    this.closed = this.closed.map((entry) => ({ ...entry, document: saved(entry.document) }));
    this.changed();
  }

  isDirty(document: OpenDocument): boolean {
    return serializeLoad(document.load) !== document.savedText;
  }

  activate(id: number): void {
    this.activeId = id;
    this.changed();
  }

  /** Closes a tab. The load is kept, unsaved changes and Undo steps included, for `reopenClosed()`. */
  close(id: number): void {
    const index = this.documents.findIndex((document) => document.id === id);
    const document = this.documents[index];
    if (!document) return;
    this.closed = [...this.closed, { document, history: this.historyOf(id) }].slice(-CLOSED_LIMIT);
    this.histories.delete(id);
    this.documents = this.documents.filter((candidate) => candidate.id !== id);
    if (this.activeId === id) this.activeId = this.documents[Math.min(index, this.documents.length - 1)]?.id;
    this.changed();
  }

  get canReopen(): boolean {
    return this.closed.length > 0;
  }

  /**
   * Opens the last closed load again, as it was. If its library entry has been opened in another tab
   * since, that tab keeps the link and the reopened load comes back as an unsaved copy, so that two
   * tabs never save over one entry.
   */
  reopenClosed(): void {
    const last = this.closed[this.closed.length - 1];
    if (!last) return;
    this.closed = this.closed.slice(0, -1);
    const { libraryId, ...rest } = last.document;
    const linked = libraryId !== undefined && !this.documents.some((document) => document.libraryId === libraryId);
    // The same id: the ordered save queue (document-saving.ts) and a save completing late both find it.
    const document: OpenDocument = linked ? { ...rest, libraryId } : { ...rest, savedText: libraryId ? '' : rest.savedText };
    this.histories.set(document.id, last.history);
    this.documents = [...this.documents, document];
    this.activeId = document.id;
    this.changed();
  }

  private changed(): void {
    this.persist();
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    const saved = this.documents.map(({ name, load, savedText, libraryId }) => ({ name, load, savedText, libraryId }));
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ documents: saved, active: this.documents.findIndex((d) => d.id === this.activeId) }));
      this.storageFull = false;
    } catch {
      // The browser's storage is full (large pictures): the loads stay open, but only a saved file keeps them.
      this.storageFull = true;
    }
  }

  private restore(): void {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      if (!text) return;
      const saved: unknown = JSON.parse(text);
      if (!record(saved) || !Array.isArray(saved.documents)) { this.recoveryFailed = true; return; }
      for (const [index, entry] of saved.documents.entries()) {
        if (!record(entry) || typeof entry.name !== 'string') { this.recoveryFailed = true; continue; }
        const checked = parseLoad(JSON.stringify(entry.load));
        if (!checked.ok) { this.recoveryFailed = true; continue; }
        const document: OpenDocument = {
          id: this.nextId++, name: entry.name, load: checked.value, issues: [],
          savedText: typeof entry.savedText === 'string' ? entry.savedText : '',
          ...(typeof entry.libraryId === 'string' && entry.libraryId ? { libraryId: entry.libraryId } : {}),
        };
        this.documents.push(document);
        if (index === saved.active) this.activeId = document.id;
      }
      this.activeId ??= this.documents[0]?.id;
    } catch {
      this.recoveryFailed = true;
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
