/**
 * Builds packages/app/src/data/community-components.json, the copy of the community components bundled
 * with the app for a first visit offline, from the CC0 corpus (the GRT Discord's shared files,
 * zen/grt_databases at 9d2f84d): powders, projectiles and calibers in SI units, each with its file,
 * author and date. Run with an official Node 24:
 *
 *     node tools/data/build-community.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtCaliber, importGrtProjectiles, importGrtPropellant, type ImportResult } from '@gordons-legacy/formats';

const CORPUS = join(import.meta.dirname, '../../packages/formats/test/fixtures/cc0');
const OUTPUT = join(import.meta.dirname, '../../packages/app/src/data/community-components.json');

/** Where a community file comes from, read from its name. */
interface Source {
  file: string;
  author: string;
  date: string;
}

/** `Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant` → author Tom24, date 2023-06-21. */
function sourceOf(file: string): Source {
  const match = /_by_(.+)_(\d{4})\.(\d{2})\.(\d{2})\.\w+$/.exec(file);
  return { file, author: match?.[1] ?? '', date: match ? `${match[2]}-${match[3]}-${match[4]}` : '' };
}

/** Imports every file of a corpus folder; a file that fails stops the build, with its issues. */
function importFolder<T>(folder: string, extension: string, importer: (text: string) => ImportResult<T>): Array<{ source: Source; value: T }> {
  return readdirSync(join(CORPUS, folder))
    .filter((file) => file.endsWith(extension))
    .sort()
    .map((file) => {
      const result = importer(readFileSync(join(CORPUS, folder, file), 'utf8'));
      if (!result.ok) throw new Error(`${file}: ${result.issues.map((issue) => issue.message).join('; ')}`);
      return { source: sourceOf(file), value: result.value };
    });
}

/** A component without its unmapped GRT values, which the app doesn't use (calibers keep theirs). */
function withoutUnmapped<T extends { unmapped?: unknown }>(component: T): Omit<T, 'unmapped'> {
  const { unmapped: _unmapped, ...rest } = component;
  return rest;
}

function main(): void {
  const powders = importFolder('powders', '.propellant', importGrtPropellant).map(({ source, value }) => ({
    source,
    propellant: withoutUnmapped(value),
  }));
  // A projectile file may hold several projectiles.
  const projectiles = importFolder('projectiles', '.projectile', importGrtProjectiles).flatMap(({ source, value }) =>
    value.map((projectile) => ({ source, projectile: withoutUnmapped(projectile) })),
  );
  const calibers = importFolder('calibers', '.caliber', importGrtCaliber).map(({ source, value }) => ({ source, caliber: value }));
  const snapshot = {
    source: 'https://github.com/zen/grt_databases',
    commit: '9d2f84d',
    licence: 'CC0-1.0',
    status: 'community, unverified',
    powders,
    projectiles,
    calibers,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(snapshot)}\n`);
  console.log(`${powders.length} powders, ${projectiles.length} projectiles, ${calibers.length} calibers → ${OUTPUT}`);
}

main();
