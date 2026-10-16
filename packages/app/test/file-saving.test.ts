import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from '../src/state/file-saving.ts';

afterEach(() => vi.unstubAllGlobals());

describe('file export', () => {
  it('treats picker cancellation separately from permission or write errors', async () => {
    vi.stubGlobal('window', { showSaveFilePicker: async () => { throw new DOMException('cancelled', 'AbortError'); } });
    expect(await saveTextFile('{}', 'load.json')).toBe(false);
    vi.stubGlobal('window', { showSaveFilePicker: async () => { throw new DOMException('permission', 'NotAllowedError'); } });
    await expect(saveTextFile('{}', 'load.json')).rejects.toThrow('permission');
    const abort = vi.fn(async () => {});
    vi.stubGlobal('window', { showSaveFilePicker: async () => ({ createWritable: async () => ({
      write: async () => { throw new DOMException('write aborted', 'AbortError'); }, abort,
    }) }) });
    await expect(saveTextFile('{}', 'load.json')).rejects.toThrow('write aborted');
    expect(abort).toHaveBeenCalledOnce();
  });

  it('uses a portable file name without changing the exported document contents', async () => {
    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const picker = vi.fn(async () => ({ createWritable: async () => ({ write, close }) }));
    vi.stubGlobal('window', { showSaveFilePicker: picker });
    const text = '{"title":"A / B: comparison"}';
    expect(await saveTextFile(text, 'A / B: comparison.json')).toBe(true);
    expect(picker.mock.calls[0]).toEqual([{ suggestedName: 'A _ B_ comparison.json', types: [{ accept: { 'application/json': ['.json'] } }] }]);
    expect(write).toHaveBeenCalledWith(text);
    expect(close).toHaveBeenCalledOnce();
  });
});
