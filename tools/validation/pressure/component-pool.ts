/**
 * The components a pressure condition is simulated with: the CC0 community corpus the app bundles, plus
 * any GRT files the person running the study holds (their own loads and component files, which stay on
 * their machine). Components are found by name only. Nothing is substituted: a condition whose powder,
 * caliber or projectile is not in the pool is reported as missing (issue #31, "The harness is not ready").
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  checkCaliber,
  checkProjectile,
  checkPropellant,
  importGrtCaliber,
  importGrtLoad,
  importGrtProjectiles,
  importGrtPropellant,
  type CaliberDefinition,
  type Projectile,
  type Propellant,
} from '@gordons-legacy/formats';

const COMMUNITY_SNAPSHOT = new URL('../../../packages/app/src/data/community-components.json', import.meta.url);

/** A component and the file it came from, which the report names. */
export interface Pooled<T> {
  value: T;
  origin: string;
}

export interface ComponentPool {
  calibers: Pooled<CaliberDefinition>[];
  powders: Pooled<Propellant>[];
  projectiles: Pooled<Projectile>[];
}

/** The community corpus, as the app bundles it. */
export function communityPool(): ComponentPool {
  type Entry = Record<string, unknown> & { source: { file: string } };
  const snapshot = JSON.parse(readFileSync(COMMUNITY_SNAPSHOT, 'utf8')) as Record<'calibers' | 'projectiles' | 'powders', Entry[]>;
  const checked = <T>(entries: Entry[], key: string, check: (value: unknown) => { ok: boolean; value?: T }): Pooled<T>[] =>
    entries.flatMap((entry) => {
      const result = check(entry[key]);
      return result.ok && result.value ? [{ value: result.value, origin: `community: ${entry.source.file}` }] : [];
    });
  return {
    calibers: checked(snapshot.calibers, 'caliber', checkCaliber),
    powders: checked(snapshot.powders, 'propellant', checkPropellant),
    projectiles: checked(snapshot.projectiles, 'projectile', checkProjectile),
  };
}

/**
 * Adds the components of every GRT file under a folder: the caliber definition and powder of each
 * `.grtload`, and the contents of `.caliber`, `.propellant` and `.projectile` files. A folder named
 * `not_mine` is skipped, as everywhere in this project.
 */
export function addLocalFiles(pool: ComponentPool, folder: string): ComponentPool {
  const calibers = [...pool.calibers];
  const powders = [...pool.powders];
  const projectiles = [...pool.projectiles];
  for (const path of filesUnder(folder)) {
    const text = readFileSync(path, 'utf8');
    switch (extname(path).toLowerCase()) {
      case '.grtload': {
        const result = importGrtLoad(text);
        if (!result.ok) break;
        if (result.value.cartridge.definition) calibers.push({ value: result.value.cartridge.definition, origin: path });
        powders.push({ value: result.value.propellant, origin: path });
        break;
      }
      case '.caliber': {
        const result = importGrtCaliber(text);
        if (result.ok) calibers.push({ value: result.value, origin: path });
        break;
      }
      case '.propellant': {
        const result = importGrtPropellant(text);
        if (result.ok) powders.push({ value: result.value, origin: path });
        break;
      }
      case '.projectile': {
        const result = importGrtProjectiles(text);
        if (result.ok) projectiles.push(...result.value.map((value) => ({ value, origin: path })));
        break;
      }
    }
  }
  return { calibers, powders, projectiles };
}

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (!statSync(path).isDirectory()) return [path];
    return name === 'not_mine' ? [] : filesUnder(path);
  });
}

/** Lower case, letters and digits only: `Reload Swiss`, `ReloadSwiss` and `reload-swiss` are one name. */
export function normalisedName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Found, or why not. When several files hold a component of the same name, they must agree: two powder
 * models named alike but different are ambiguous, and the study refuses to pick one.
 */
export type Resolution<T> = { found: Pooled<T> } | { missing: string };

export function findCaliber(pool: ComponentPool, name: string): Resolution<CaliberDefinition> {
  const matches = pool.calibers.filter((entry) => normalisedName(entry.value.name) === normalisedName(name));
  return single(matches, `caliber definition "${name}"`, (a, b) => physical(a) === physical(b));
}

export function findPowder(pool: ComponentPool, maker: string, product: string): Resolution<Propellant> {
  const wanted = normalisedName(`${maker} ${product}`);
  const matches = pool.powders.filter((entry) => normalisedName(`${entry.value.maker} ${entry.value.product}`) === wanted);
  return single(matches, `powder model "${maker} ${product}"`, (a, b) => physical(a) === physical(b));
}

export function findProjectile(pool: ComponentPool, name: string): Resolution<Projectile> {
  const matches = pool.projectiles.filter((entry) => normalisedName(entry.value.name) === normalisedName(name));
  return single(matches, `projectile "${name}"`, (a, b) => physical(a) === physical(b));
}

/** What the engines read of a component: everything but its provenance and the values kept verbatim. */
function physical(component: Propellant | Projectile | CaliberDefinition): string {
  const { info: _info, unmapped: _unmapped, ...rest } = component;
  if ('lot' in rest) delete (rest as { lot?: string }).lot;
  return JSON.stringify(rest);
}

function single<T>(matches: Pooled<T>[], what: string, same: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)): Resolution<T> {
  const [first, ...others] = matches;
  if (!first) return { missing: `no ${what} in the component pool` };
  const different = others.filter((entry) => !same(entry.value, first.value));
  if (different.length > 0) return { missing: `${what} is ambiguous: ${[first, ...different].map((entry) => entry.origin).join(', ')} differ` };
  return { found: first };
}
