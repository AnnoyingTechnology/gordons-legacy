import { importGrtLoad } from './grt/grtload-import.ts';
import type { ImportResult } from './import-issues.ts';
import { parseLoad } from './json/load-json.ts';
import type { Load } from './load/load.ts';

/** Whether a file name is GRT's (`.grtload`) rather than a load saved in this project's JSON format. */
export function isGrtLoadFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.grtload');
}

/**
 * Reads a load file: a `.grtload` written by GRT, or a load saved as JSON. The name tells them apart,
 * and a GRT load keeps it as its import origin.
 */
export function readLoadFile(fileName: string, text: string): ImportResult<Load> {
  return isGrtLoadFile(fileName) ? importGrtLoad(text, { fileName }) : parseLoad(text);
}
