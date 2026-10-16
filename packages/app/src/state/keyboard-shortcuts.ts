/** Browser-reserved Ctrl/Cmd+N and Ctrl/Cmd+W are deliberately absent. */
export type DocumentShortcut = 'new' | 'close' | 'save';

/** Only an explicitly enabled, non-repeating command can claim a key event. */
export function documentShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>,
  enabled: boolean,
): DocumentShortcut | undefined {
  if (!enabled || event.repeat || event.isComposing || event.defaultPrevented) return undefined;
  const key = event.key.toLowerCase();
  if (key === 's' && !event.altKey && !event.shiftKey && event.ctrlKey !== event.metaKey) return 'save';
  if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    // Option changes event.key to a symbol on macOS; code still identifies the shortcut key.
    if (key === 'n' || event.code === 'KeyN') return 'new';
    if (key === 'w' || event.code === 'KeyW') return 'close';
  }
  return undefined;
}
