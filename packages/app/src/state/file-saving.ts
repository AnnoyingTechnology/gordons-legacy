/** Saving a text to a file the user chooses, where the browser lets us, else as a download. */

type SavePicker = (options: object) => Promise<FileSystemFileHandle>;

/**
 * Writes `text` to a file: with the File System Access API (Chromium) the user picks where; elsewhere
 * (Firefox, Safari) the browser downloads it. Returns false when the user cancels the picker;
 * write failures reject so the caller can report them.
 */
export async function saveTextFile(text: string, suggestedName: string): Promise<boolean> {
  const picker = (window as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  const name = suggestedName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '') || 'load.json';
  if (!picker) {
    download(text, name);
    return true;
  }
  let handle: FileSystemFileHandle;
  try {
    handle = await picker({ suggestedName: name, types: [{ accept: { 'application/json': ['.json'] } }] });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    // Release an incomplete stream where possible, preserving the original failure for the UI.
    try { await writable.abort(); } catch { /* The failed close may have already released it. */ }
    throw error;
  }
  return true;
}

/** Downloads text as a JSON file. */
export function download(text: string, name: string): void {
  const link = Object.assign(window.document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    download: name,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}
