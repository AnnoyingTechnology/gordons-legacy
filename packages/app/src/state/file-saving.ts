/** Saving a text to a file the user chooses, where the browser lets us, else as a download. */

type SavePicker = (options: object) => Promise<FileSystemFileHandle>;

/**
 * Writes `text` to a file: with the File System Access API (Chromium) the user picks where; elsewhere
 * (Firefox, Safari) the browser downloads it. Returns false when the user cancels the picker.
 */
export async function saveTextFile(text: string, suggestedName: string): Promise<boolean> {
  const picker = (window as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!picker) {
    download(text, suggestedName);
    return true;
  }
  try {
    const handle = await picker({ suggestedName, types: [{ accept: { 'application/json': ['.json'] } }] });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch {
    return false;
  }
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
