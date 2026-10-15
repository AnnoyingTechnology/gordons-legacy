import {
  checkCaliber,
  checkProjectile,
  checkPropellant,
  importGrtCaliber,
  importGrtProjectiles,
  importGrtPropellant,
  type CaliberDefinition,
  type Projectile,
  type Propellant,
} from '@gordons-legacy/formats';
import { cachedDocuments, DATA_REPOSITORY_URL, synchronise, type ComponentDocument, type ComponentKind, type DataCache } from '@gordons-legacy/data';
import community from '../data/community-components.json' with { type: 'json' };
import type { RecordStore } from './indexed-db.ts';

/** Where a component comes from, shown with it so that the user can judge it. */
export interface ComponentSource {
  /** `community`: the CC0 files shared by GRT users, unverified; `user`: imported by the user. */
  origin: 'community' | 'user';
  /** The file it was read from. */
  file: string;
  /** Who made it, when the file says (community files carry `_by_<author>_<date>`). */
  author: string;
  /** When it was made or imported, YYYY-MM-DD. */
  date: string;
}

export type ComponentEntry =
  | { id: string; kind: 'propellant'; source: ComponentSource; value: Propellant }
  | { id: string; kind: 'projectile'; source: ComponentSource; value: Projectile }
  | { id: string; kind: 'caliber'; source: ComponentSource; value: CaliberDefinition };

/** "community" or "yours": the label of a component's origin, as lists show it. */
export function originLabel(source: ComponentSource): 'components.community' | 'components.yours' {
  return source.origin === 'community' ? 'components.community' : 'components.yours';
}

/** The bundled snapshot of the community corpus (tools/data/build-community.ts). */
interface CommunitySnapshot {
  powders: Array<{ source: { file: string; author: string; date: string }; propellant: unknown }>;
  projectiles: Array<{ source: { file: string; author: string; date: string }; projectile: unknown }>;
  calibers: Array<{ source: { file: string; author: string; date: string }; caliber: unknown }>;
}

/** The community's powders and projectiles, checked like any input. */
export function communityComponents(snapshot: CommunitySnapshot = community as CommunitySnapshot): ComponentEntry[] {
  const entries: ComponentEntry[] = [];
  snapshot.powders.forEach(({ source, propellant }, index) => {
    const result = checkPropellant(propellant);
    if (result.ok) entries.push({ id: `community-powder-${index}`, kind: 'propellant', source: { origin: 'community', ...source }, value: result.value });
  });
  snapshot.projectiles.forEach(({ source, projectile }, index) => {
    const result = checkProjectile(projectile);
    if (result.ok) entries.push({ id: `community-projectile-${index}`, kind: 'projectile', source: { origin: 'community', ...source }, value: result.value });
  });
  snapshot.calibers.forEach(({ source, caliber }, index) => {
    const result = checkCaliber(caliber);
    if (result.ok) entries.push({ id: `community-caliber-${index}`, kind: 'caliber', source: { origin: 'community', ...source }, value: result.value });
  });
  return entries;
}

/** The data repository's documents as component entries, identified by their path in the repository. */
export function repositoryComponents(documents: ReadonlyArray<{ path: string; document: ComponentDocument }>): ComponentEntry[] {
  return documents.flatMap(({ path, document }): ComponentEntry[] => {
    const source: ComponentSource = { origin: 'community', file: document.provenance.file, author: document.provenance.author, date: document.provenance.date };
    const id = `repository:${path}`;
    if (document.kind === 'powder') return [{ id, kind: 'propellant', source, value: document.value }];
    if (document.kind === 'projectile') return [{ id, kind: 'projectile', source, value: document.value }];
    if (document.kind === 'caliber') return [{ id, kind: 'caliber', source, value: document.value }];
    // A gun is not part of a load's recipe: the published ones go to the gun library (state/firearms.ts).
    return [];
  });
}

/** What a load is made of. The repository's guns are fetched on their own (state/published-firearms.ts). */
const COMPONENT_KINDS: readonly ComponentKind[] = ['powder', 'projectile', 'caliber'];

/** Where the community's components came from this time: the repository, its cache, or the bundled copy. */
export type CommunitySource = 'repository' | 'cache' | 'bundled';

/**
 * Powders, projectiles and calibers to choose from: the community's, bundled with the app, and the user's own,
 * imported from GRT files and kept in the browser. Listeners are told after every change.
 */
export class ComponentLibrary {
  entries: ComponentEntry[];
  /** Where the community's entries come from now. */
  communitySource: CommunitySource = 'bundled';
  readonly ready: Promise<void>;
  private readonly store: RecordStore<ComponentEntry>;
  private readonly listeners = new Set<() => void>();

  constructor(store: RecordStore<ComponentEntry>, community: ComponentEntry[] = communityComponents()) {
    this.store = store;
    this.entries = community;
    this.ready = store.list().then((stored) => {
      this.entries = [...this.entries, ...stored.flatMap(checked)];
      this.changed();
    });
  }

  /**
   * Takes the community's components from the data repository (docs/PLAN.md, Data): first from the
   * cache of an earlier visit, then, when online, from the repository itself, each file checked against
   * its SHA-256 and the load format. Until either succeeds, the bundled copy stays.
   */
  async useRepository(cache: DataCache, fetch: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>): Promise<void> {
    await this.ready;
    const cached = await cachedDocuments(cache);
    if (cached.length > 0) this.replaceCommunity(repositoryComponents(cached), 'cache');
    try {
      const report = await synchronise(DATA_REPOSITORY_URL, cache, fetch, COMPONENT_KINDS);
      if (report.documents.length > 0) this.replaceCommunity(repositoryComponents(report.documents), 'repository');
    } catch {
      // Offline or the repository unreachable: keep what we have.
    }
  }

  private replaceCommunity(community: ComponentEntry[], source: CommunitySource): void {
    this.entries = [...community, ...this.entries.filter((entry) => entry.source.origin === 'user')];
    this.communitySource = source;
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  powders(): Array<Extract<ComponentEntry, { kind: 'propellant' }>> {
    return this.entries.filter((entry) => entry.kind === 'propellant');
  }

  projectiles(): Array<Extract<ComponentEntry, { kind: 'projectile' }>> {
    return this.entries.filter((entry) => entry.kind === 'projectile');
  }

  calibers(): Array<Extract<ComponentEntry, { kind: 'caliber' }>> {
    return this.entries.filter((entry) => entry.kind === 'caliber');
  }

  /** Adds the powders, projectiles or caliber of a GRT file; returns error messages when it can't be read. */
  async importFile(name: string, text: string): Promise<string[]> {
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
    const source: ComponentSource = { origin: 'user', file: name, author: '', date: new Date().toISOString().slice(0, 10) };
    const added: ComponentEntry[] = [];
    if (extension === '.propellant') {
      const result = importGrtPropellant(text);
      if (!result.ok) return result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
      added.push({ id: crypto.randomUUID(), kind: 'propellant', source, value: result.value });
    } else if (extension === '.projectile') {
      const result = importGrtProjectiles(text);
      if (!result.ok) return result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
      for (const projectile of result.value) added.push({ id: crypto.randomUUID(), kind: 'projectile', source, value: projectile });
    } else if (extension === '.caliber') {
      const result = importGrtCaliber(text);
      if (!result.ok) return result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
      added.push({ id: crypto.randomUUID(), kind: 'caliber', source, value: result.value });
    } else {
      return [`${name}: not a .propellant, .projectile or .caliber file`];
    }
    for (const entry of added) await this.store.put(entry);
    this.entries = [...this.entries, ...added];
    this.changed();
    return [];
  }

  /** Keeps a caliber made or edited in the cartridge designer as one of the user's components. */
  async addCaliber(definition: CaliberDefinition): Promise<void> {
    const entry: ComponentEntry = {
      id: crypto.randomUUID(),
      kind: 'caliber',
      source: { origin: 'user', file: '', author: '', date: new Date().toISOString().slice(0, 10) },
      value: definition,
    };
    await this.store.put(entry);
    this.entries = [...this.entries, entry];
    this.changed();
  }

  /** Removes one of the user's components (the community's stay). */
  async remove(id: string): Promise<void> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.source.origin !== 'user') return;
    await this.store.remove(id);
    this.entries = this.entries.filter((candidate) => candidate.id !== id);
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

function checked(entry: ComponentEntry): ComponentEntry[] {
  if (entry.kind === 'caliber') {
    const result = checkCaliber(entry.value);
    return result.ok ? [{ ...entry, value: result.value }] : [];
  }
  if (entry.kind === 'propellant') {
    const result = checkPropellant(entry.value);
    return result.ok ? [{ ...entry, value: result.value }] : [];
  }
  const result = checkProjectile(entry.value);
  return result.ok ? [{ ...entry, value: result.value }] : [];
}
