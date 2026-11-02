import type { Load } from '@gordons-legacy/formats';

/** What Undo restores: the load and the tab's name, which a rename changes together. */
export interface DocumentSnapshot {
  name: string;
  load: Load;
}

/** Steps kept per document. Old steps are dropped first: Undo is a safety net, not a version history. */
export const HISTORY_LIMIT = 100;

/**
 * Edits closer together than this merge into one Undo step, ms. The editor re-simulates on every
 * keystroke and sends each one as an edit; without merging, typing "2.85" would take four Undos.
 */
export const MERGE_WINDOW = 1000;

/**
 * One document's Undo and Redo stacks (issue #34). Each step holds the state before a change. Steps
 * live in memory only: a reload starts with an empty history, as in most editors.
 */
export class DocumentHistory {
  private undoSteps: DocumentSnapshot[] = [];
  private redoSteps: DocumentSnapshot[] = [];
  private lastRecord = Number.NEGATIVE_INFINITY;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get canUndo(): boolean {
    return this.undoSteps.length > 0;
  }

  get canRedo(): boolean {
    return this.redoSteps.length > 0;
  }

  /**
   * Records the state before a change. A change that `merges` (an edit typed in a field) and follows
   * the previous one within `MERGE_WINDOW` extends that step instead of making a new one; any change
   * clears Redo.
   */
  record(before: DocumentSnapshot, merges: boolean): void {
    const time = this.now();
    const extendsLast = merges && this.undoSteps.length > 0 && time - this.lastRecord < MERGE_WINDOW;
    this.lastRecord = merges ? time : Number.NEGATIVE_INFINITY;
    this.redoSteps = [];
    if (extendsLast) return;
    this.undoSteps.push(before);
    if (this.undoSteps.length > HISTORY_LIMIT) this.undoSteps.shift();
  }

  /** The state to return to, given the current one, which Redo can then restore. */
  undo(current: DocumentSnapshot): DocumentSnapshot | undefined {
    const previous = this.undoSteps.pop();
    if (!previous) return undefined;
    this.redoSteps.push(current);
    this.lastRecord = Number.NEGATIVE_INFINITY;
    return previous;
  }

  redo(current: DocumentSnapshot): DocumentSnapshot | undefined {
    const next = this.redoSteps.pop();
    if (!next) return undefined;
    this.undoSteps.push(current);
    this.lastRecord = Number.NEGATIVE_INFINITY;
    return next;
  }
}
