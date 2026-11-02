/** Browser-reserved Ctrl/Cmd+N, Ctrl/Cmd+W and Ctrl/Cmd+Shift+T are deliberately absent. */
export type DocumentShortcut = 'new' | 'close' | 'save' | 'undo' | 'redo' | 'reopen';

/**
 * Only an explicitly enabled, non-repeating command can claim a key event. Undo and Redo leave a text
 * field's own undo alone: inside one (`inTextField`), Ctrl/Cmd+Z belongs to the field.
 */
export function documentShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>,
  enabled: boolean,
  inTextField = false,
): DocumentShortcut | undefined {
  if (!enabled || event.isComposing || event.defaultPrevented) return undefined;
  const key = event.key.toLowerCase();
  const command = event.ctrlKey !== event.metaKey && !event.altKey;
  // Holding Ctrl/Cmd+Z steps back repeatedly, as in other editors; the other commands don't repeat.
  if (command && !inTextField) {
    if (key === 'z' && !event.shiftKey) return 'undo';
    if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey && event.ctrlKey)) return 'redo';
  }
  if (event.repeat) return undefined;
  if (key === 's' && command && !event.shiftKey) return 'save';
  if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    // Option changes event.key to a symbol on macOS; code still identifies the shortcut key.
    if (key === 'n' || event.code === 'KeyN') return 'new';
    if (key === 'w' || event.code === 'KeyW') return 'close';
    if (key === 't' || event.code === 'KeyT') return 'reopen';
  }
  return undefined;
}

/** Input types where the browser keeps its own undo of typed text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password']);

/** Whether the element receiving a key press is a text entry with its own undo. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}
