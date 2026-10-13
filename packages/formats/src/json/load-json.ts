import { IssueLog, type ImportResult } from '../import-issues.ts';
import { LOAD_FORMAT, LOAD_SCHEMA_VERSION, type Load } from '../load/load.ts';
import { LOAD_SPEC } from './load-shape.ts';
import { checkValue } from './shape.ts';

/** Writes a load as the JSON text saved to disk. */
export function serializeLoad(load: Load): string {
  return `${JSON.stringify(load, null, 2)}\n`;
}

/**
 * Reads a load saved as JSON and checks every field. Fields from a newer version of the format are
 * dropped with a warning. When the format gets a version 2, documents of version 1 are upgraded here
 * before being checked.
 */
export function parseLoad(text: string): ImportResult<Load> {
  const log = new IssueLog();
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    log.error('json-syntax', `The file is not valid JSON: ${(error as Error).message}`);
    return log.failure();
  }

  const header = document as { format?: unknown; schemaVersion?: unknown } | null;
  if (typeof header !== 'object' || header === null || header.format !== LOAD_FORMAT) {
    log.error('not-a-load', `The file is not a Gordon's Legacy load (no "format": "${LOAD_FORMAT}").`);
    return log.failure();
  }
  if (typeof header.schemaVersion === 'number' && header.schemaVersion > LOAD_SCHEMA_VERSION) {
    log.error(
      'newer-version',
      `The load was saved by a newer version of Gordon's Legacy (format version ${header.schemaVersion}); ` +
        'update the application to open it.',
    );
    return log.failure();
  }

  const load = checkValue(document, LOAD_SPEC, '', log) as Load;
  return log.result(load);
}
