import { IssueLog, type ImportResult } from '../import-issues.ts';
import type { CaliberDefinition } from '../load/cartridge.ts';
import type { Projectile } from '../load/projectile.ts';
import type { Propellant } from '../load/propellant.ts';
import { readCaliberDefinition } from './caliber-mapping.ts';
import { parseGrtDocument, readFields } from './grt-document.ts';
import { readProjectileFileEntry } from './projectile-mapping.ts';
import { readPropellant } from './propellant-mapping.ts';
import { childNamed, childrenNamed } from './xml.ts';

/** Imports a GRT caliber file (`.caliber`). */
export function importGrtCaliber(source: string): ImportResult<CaliberDefinition> {
  const log = new IssueLog();
  const section = findSection(source, 'caliberfile', log);
  if (section === undefined) return log.failure();
  return log.result(readCaliberDefinition(readFields(section, 'caliberfile', log)));
}

/** Imports a GRT propellant file (`.propellant`). */
export function importGrtPropellant(source: string): ImportResult<Propellant> {
  const log = new IssueLog();
  const section = findSection(source, 'propellantfile', log);
  if (section === undefined) return log.failure();
  return log.result(readPropellant(readFields(section, 'propellantfile', log)));
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
  const projectiles = sections.map((section, index) =>
    readProjectileFileEntry(readFields(section, `projectilefile[${index + 1}]`, log)),
  );
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
