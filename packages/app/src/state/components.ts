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
import { cachedDocuments, DATA_REPOSITORY_URL, readDocument, synchronise, type ComponentDocument, type ComponentKind, type DataCache } from '@gordons-legacy/data';
import community from '../data/community-components.json' with { type: 'json' };
import grtCatalogue from '../data/grt-catalogue.json' with { type: 'json' };
import type { RecordStore } from './indexed-db.ts';

/** Where a component comes from, shown with it so that the user can judge it. */
export interface ComponentSource {
  /**
   * `community`: the CC0 files shared by GRT users, unverified; `grt`: GRT's own database, shipped with
   * the permission of Gordon's family (issue #19), unverified too; `user`: imported by the user.
   */
  origin: 'community' | 'grt' | 'user';
  /** The file it was read from. */
  file: string;
  /** Who made it, when the file says (community files carry `_by_<author>_<date>`, GRT's entries their author). */
  author: string;
  /** When it was made or imported, YYYY-MM-DD. */
  date: string;
  /**
   * The data repository's file it was published in (`grt/powders/hodgdon.json`), for the repository's
   * and its bundled copy's entries: a newer copy of that file replaces them, a file the repository
   * withdraws takes them away.
   */
  document?: string;
}

export type ComponentEntry =
  | { id: string; kind: 'propellant'; source: ComponentSource; value: Propellant }
  | { id: string; kind: 'projectile'; source: ComponentSource; value: Projectile }
  | { id: string; kind: 'caliber'; source: ComponentSource; value: CaliberDefinition };

/** "community", "GRT" or "yours": the label of a component's origin, as lists show it. */
export function originLabel(source: ComponentSource): 'components.community' | 'components.grt' | 'components.yours' {
  if (source.origin === 'community') return 'components.community';
  return source.origin === 'grt' ? 'components.grt' : 'components.yours';
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

/**
 * The data repository's documents as component entries, identified by their path in the repository
 * and, in one of GRT's catalogue documents, their place in it. The bundled copy of GRT's catalogue
 * is the same documents (tools/data/build-grt-catalogue.ts), so an entry keeps its id once the
 * repository has been reached.
 */
export function repositoryComponents(documents: ReadonlyArray<{ path: string; document: ComponentDocument }>): ComponentEntry[] {
  return documents.flatMap(({ path, document }): ComponentEntry[] => {
    const { provenance } = document;
    const source: ComponentSource = { origin: 'community', file: provenance.file, author: provenance.author, date: provenance.date, document: path };
    const id = `repository:${path}`;
    if (document.kind === 'powder') return [{ id, kind: 'propellant', source, value: document.value }];
    if (document.kind === 'projectile') return [{ id, kind: 'projectile', source, value: document.value }];
    if (document.kind === 'caliber') return [{ id, kind: 'caliber', source, value: document.value }];
    // No author: the catalogue holds GRT's own entries only (tools/data/grt-catalogue/), which the
    // origin's label already says. The date is the entry's own, from GRT.
    const grtSource = (value: Propellant | Projectile | CaliberDefinition): ComponentSource => ({
      origin: 'grt',
      file: provenance.file,
      author: '',
      date: value.info?.modifiedOn || value.info?.createdOn || provenance.date,
      document: path,
    });
    const grtId = (index: number) => `${id}#${index}`;
    if (document.kind === 'grt-powders') return document.value.map((value, index) => ({ id: grtId(index), kind: 'propellant', source: grtSource(value), value }));
    if (document.kind === 'grt-projectiles') return document.value.map((value, index) => ({ id: grtId(index), kind: 'projectile', source: grtSource(value), value }));
    if (document.kind === 'grt-calibers') return document.value.map((value, index) => ({ id: grtId(index), kind: 'caliber', source: grtSource(value), value }));
    // A gun is not part of a load's recipe: the published ones go to the gun library (state/firearms.ts).
    return [];
  });
}

/** The bundled copy of GRT's catalogue, as the repository serves it: one document per maker. */
interface BundledDocument {
  path: string;
  document: unknown;
}

/** GRT's powders, bullets and cartridges bundled with the app, each document checked as a download is. */
export function grtComponents(documents: readonly BundledDocument[] = grtCatalogue as BundledDocument[]): ComponentEntry[] {
  return repositoryComponents(
    documents.flatMap(({ path, document }) => {
      const checked = readDocument(JSON.stringify(document));
      return checked === undefined ? [] : [{ path, document: checked }];
    }),
  );
}

/** What a load is made of. The repository's guns are fetched on their own (state/published-firearms.ts). */
const LOAD_PART_KINDS: readonly ComponentKind[] = ['powder', 'projectile', 'caliber', 'grt-powders', 'grt-projectiles', 'grt-calibers'];

/** Where the community's components came from this time: the repository, its cache, or the bundled copy. */
export type CommunitySource = 'repository' | 'cache' | 'bundled';

/**
 * Powders, projectiles and calibers to choose from: the community's and GRT's, bundled with the app and
 * then taken from the data repository, and the user's own, imported from GRT files and kept in the
 * browser. Listeners are told after every change.
 */
export class ComponentLibrary {
  entries: ComponentEntry[];
  /** Where the community's entries come from now. */
  communitySource: CommunitySource = 'bundled';
  readonly ready: Promise<void>;
  private readonly store: RecordStore<ComponentEntry>;
  private readonly listeners = new Set<() => void>();

  constructor(store: RecordStore<ComponentEntry>, published: ComponentEntry[] = [...communityComponents(), ...grtComponents()]) {
    this.store = store;
    this.entries = published;
    this.ready = store.list().then((stored) => {
      this.entries = [...this.entries, ...stored.flatMap(checked)];
      this.changed();
    });
  }

  /**
   * Takes the published components from the data repository (docs/PLAN.md, Data): first from the cache
   * of an earlier visit, then, when online, from the repository itself, each file checked against its
   * SHA-256 and the load format. Until either succeeds, the bundled copy stays.
   */
  async useRepository(cache: DataCache, fetch: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>): Promise<void> {
    await this.ready;
    const cached = await cachedDocuments(cache);
    // Offline, the cache may simply not hold a file yet: every other document stays.
    if (cached.length > 0) this.replacePublished(repositoryComponents(cached), 'cache', () => true);
    let report;
    try {
      report = await synchronise(DATA_REPOSITORY_URL, cache, fetch, LOAD_PART_KINDS);
    } catch {
      // Offline or the repository unreachable: keep what we have.
      return;
    }
    // The index is the repository's word: a document it no longer lists is withdrawn, one whose
    // download or check failed keeps the copy we have.
    const failed = new Set(report.failed.map((file) => file.path));
    this.replacePublished(repositoryComponents(report.documents), 'repository', (document) => failed.has(document));
  }

  /**
   * Puts published entries in place of those they supersede: a document's entries replace those of the
   * same document, and any community document replaces the bundled community snapshot, which has no
   * documents. The entries of other documents stay where `keep` says so. The user's own always stay.
   */
  private replacePublished(published: ComponentEntry[], source: CommunitySource, keep: (document: string) => boolean): void {
    const documents = new Set(published.map((entry) => entry.source.document));
    const communityDelivered = published.some((entry) => entry.source.origin === 'community');
    const stays = ({ source: { origin, document } }: ComponentEntry) => {
      if (origin === 'user') return true;
      if (document === undefined) return !(origin === 'community' && communityDelivered);
      return !documents.has(document) && keep(document);
    };
    this.entries = [...published, ...this.entries.filter(stays)];
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
    // One transaction: a projectile file of many bullets is kept whole or not at all.
    await this.store.putAll(added);
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

  /** Removes one of the user's components (the published ones stay). */
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

/**
 * A stored entry, or nothing. Each kind is checked against its own format, and an entry whose `kind` is
 * not one of the three is dropped: it used to fall through to the projectile check, so a record from a
 * later version of the app — or a damaged one — was read as something it never was (#32).
 */
function checked(entry: ComponentEntry): ComponentEntry[] {
  if (entry.kind === 'caliber') {
    const result = checkCaliber(entry.value);
    return result.ok ? [{ ...entry, value: result.value }] : [];
  }
  if (entry.kind === 'propellant') {
    const result = checkPropellant(entry.value);
    return result.ok ? [{ ...entry, value: result.value }] : [];
  }
  if (entry.kind !== 'projectile') return [];
  const result = checkProjectile(entry.value);
  return result.ok ? [{ ...entry, value: result.value }] : [];
}
