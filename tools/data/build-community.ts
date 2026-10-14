// Builds packages/app/src/data/community-components.json from the CC0 community corpus (the GRT
// Discord's shared files, zen/grt_databases at 9d2f84d): powders and projectiles in the load format's SI
// units, each with its file, author and date. Run with an official Node 24:
//   node tools/data/build-community.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtProjectiles, importGrtPropellant, type Projectile, type Propellant } from '@gordons-legacy/formats';

const CORPUS = join(import.meta.dirname, '../../packages/formats/test/fixtures/cc0');
const OUTPUT = join(import.meta.dirname, '../../packages/app/src/data/community-components.json');

/** `Alliant_Red_Dot_-_2023_06_21_by_Tom24_2023.06.21.propellant` → author Tom24, date 2023-06-21. */
function provenance(file: string) {
  const match = /_by_(.+)_(\d{4})\.(\d{2})\.(\d{2})\.\w+$/.exec(file);
  return { file, author: match?.[1] ?? '', date: match ? `${match[2]}-${match[3]}-${match[4]}` : '' };
}

function files(folder: string, extension: string): string[] {
  return readdirSync(join(CORPUS, folder)).filter((file) => file.endsWith(extension)).sort();
}

const powders: Array<{ source: ReturnType<typeof provenance>; propellant: Propellant }> = [];
for (const file of files('powders', '.propellant')) {
  const result = importGrtPropellant(readFileSync(join(CORPUS, 'powders', file), 'utf8'));
  if (!result.ok) throw new Error(`${file}: ${result.issues.map((issue) => issue.message).join('; ')}`);
  const { unmapped: _unmapped, ...propellant } = result.value;
  powders.push({ source: provenance(file), propellant });
}

const projectiles: Array<{ source: ReturnType<typeof provenance>; projectile: Projectile }> = [];
for (const file of files('projectiles', '.projectile')) {
  const result = importGrtProjectiles(readFileSync(join(CORPUS, 'projectiles', file), 'utf8'));
  if (!result.ok) throw new Error(`${file}: ${result.issues.map((issue) => issue.message).join('; ')}`);
  for (const entry of result.value) {
    const { unmapped: _unmapped, ...projectile } = entry;
    projectiles.push({ source: provenance(file), projectile });
  }
}

const snapshot = {
  source: 'https://github.com/zen/grt_databases',
  commit: '9d2f84d',
  licence: 'CC0-1.0',
  status: 'community, unverified',
  powders,
  projectiles,
};
writeFileSync(OUTPUT, `${JSON.stringify(snapshot)}\n`);
console.log(`${powders.length} powders, ${projectiles.length} projectiles → ${OUTPUT}`);
