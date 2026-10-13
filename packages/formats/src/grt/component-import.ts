import { IssueLog, type ImportResult } from '../import-issues.ts';
import { CALIBER_DEFINITION_SPEC, PROJECTILE_SPEC, PROPELLANT_SPEC } from '../json/load-shape.ts';
import { checkValue } from '../json/shape.ts';
import type { CaliberDefinition } from '../load/cartridge.ts';
import type { Projectile } from '../load/projectile.ts';
import type { Propellant } from '../load/propellant.ts';
import { readCaliberDefinition } from './caliber-mapping.ts';
import { parseGrtDocument, readFields } from './grt-document.ts';
import { readProjectileFileEntry } from './projectile-mapping.ts';
import { readPropellant } from './propellant-mapping.ts';
import { childNamed, childrenNamed } from './xml.ts';

/*
 * Each importer checks its result against the same specification as a saved load, so that an import
 * can't produce a component with impossible values.
 */

/** Imports a GRT caliber file (`.caliber`). */
export function importGrtCaliber(source: string): ImportResult<CaliberDefinition> {
  const log = new IssueLog();
  const section = findSection(source, 'caliberfile', log);
  if (section === undefined) return log.failure();
  const caliber = readCaliberDefinition(readFields(section, 'caliberfile', log));
  checkValue(caliber, CALIBER_DEFINITION_SPEC, '', log);
  return log.result(caliber);
}

/** Imports a GRT propellant file (`.propellant`). */
export function importGrtPropellant(source: string): ImportResult<Propellant> {
  const log = new IssueLog();
  const section = findSection(source, 'propellantfile', log);
  if (section === undefined) return log.failure();
  const propellant = readPropellant(readFields(section, 'propellantfile', log));
  checkValue(propellant, PROPELLANT_SPEC, '', log);
  return log.result(propellant);
}

/** Imports a GRT projectile file (`.projectile`), which may hold several projectiles. */
export function importGrtProjectiles(source: string): ImportResult<Projectile[]> {
  const log = new IssueLog();
  const root = parseGrtDocument(source, log);
  if (root === undefined) return log.failure();
  const sections = childrenNamed(root, 'projectilefile');
  if (sections.length === 0) {
    log.error('not-a-grt-component', 'The file has no <projectilefile> section; it is not a GRT projectile file.');
    return log.failure();
  }
  const projectiles = sections.map((section, index) => {
    const path = `projectilefile[${index + 1}]`;
    const projectile = readProjectileFileEntry(readFields(section, path, log));
    checkValue(projectile, PROJECTILE_SPEC, path, log);
    return projectile;
  });
  return log.result(projectiles);
}

function findSection(source: string, name: string, log: IssueLog) {
  const root = parseGrtDocument(source, log);
  if (root === undefined) return undefined;
  const section = childNamed(root, name);
  if (section === undefined) {
    log.error('not-a-grt-component', `The file has no <${name}> section.`);
  }
  return section;
}
