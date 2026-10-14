import { IssueLog, type ImportResult } from '../import-issues.ts';
import { LOAD_FORMAT, LOAD_SCHEMA_VERSION, type Load } from '../load/load.ts';
import type { CaliberDefinition } from '../load/cartridge.ts';
import type { Projectile } from '../load/projectile.ts';
import type { Propellant } from '../load/propellant.ts';
import { CALIBER_DEFINITION_SPEC, LOAD_SPEC, PROJECTILE_SPEC, PROPELLANT_SPEC } from './load-shape.ts';
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

/**
 * Checks a powder, projectile or caliber held apart from a load (a component library), field by field as in a
 * saved load. `value` is the parsed JSON.
 */
export function checkPropellant(value: unknown): ImportResult<Propellant> {
  const log = new IssueLog();
  return log.result(checkValue(value, PROPELLANT_SPEC, '', log) as Propellant);
}

export function checkProjectile(value: unknown): ImportResult<Projectile> {
  const log = new IssueLog();
  return log.result(checkValue(value, PROJECTILE_SPEC, '', log) as Projectile);
}

export function checkCaliber(value: unknown): ImportResult<CaliberDefinition> {
  const log = new IssueLog();
  return log.result(checkValue(value, CALIBER_DEFINITION_SPEC, '', log) as CaliberDefinition);
}
