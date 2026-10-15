import type { CaliberDefinition, Firearm, Projectile, Propellant } from '@gordons-legacy/formats';

/** Where the data repository's files are served: raw GitHub, which allows cross-origin reads. */
export const DATA_REPOSITORY_URL = 'https://raw.githubusercontent.com/AnnoyingTechnology/gordons-legacy-data/main/';

/** `index.json`: every file of the repository with its SHA-256. */
export interface DataIndex {
  format: 'gordons-legacy.data-index';
  version: 1;
  files: DataIndexEntry[];
}

export interface DataIndexEntry {
  /** Path from the repository's root, for example `powders/alliant-red-dot-tom24-2023-06-21.json`. */
  path: string;
  kind: ComponentKind;
  /** Display name. */
  name: string;
  /** SHA-256 of the file's bytes, lower-case hexadecimal. */
  sha256: string;
}

/**
 * What a file of the repository holds. `firearm` is the published gun database (issue #30): one file per
 * maker, holding that maker's guns, synchronised on its own because a load editor has no use for it
 * until a user looks for their gun.
 */
export type ComponentKind = 'powder' | 'projectile' | 'caliber' | 'firearm';

/** Where a component comes from and how far it has been checked. */
export interface Provenance {
  /** Who shared it and under which licence, for example `GRT community file (GRT Discord), CC0`. */
  origin: string;
  /** The source it was taken from: a repository and commit, a publication. */
  source: string;
  /** The original file's name, when it came from a file. */
  file: string;
  author: string;
  /** YYYY-MM-DD. */
  date: string;
  /** How the values were obtained, for example `shared GRT model, converted to SI`. */
  method: string;
  /** `unverified` until checked against published data. */
  status: string;
}

/** One file of the repository: a component in the load format's SI units, with its provenance. */
export type ComponentDocument =
  | { format: 'gordons-legacy.component'; version: 1; kind: 'powder'; provenance: Provenance; value: Propellant }
  | { format: 'gordons-legacy.component'; version: 1; kind: 'projectile'; provenance: Provenance; value: Projectile }
  | { format: 'gordons-legacy.component'; version: 1; kind: 'caliber'; provenance: Provenance; value: CaliberDefinition }
  // One maker's published guns, as a list rather than a file each: the application downloads the whole
  // catalogue to search it, and the makers read so far hold about 2,500 guns — that many single files
  // would be that many requests on a first search. Each gun still carries its own `source` (the page,
  // the date it was read, what its published mass includes); the provenance here says how the file was
  // made, as it does for every other kind.
  | { format: 'gordons-legacy.component'; version: 1; kind: 'firearm'; provenance: Provenance; value: Firearm[] };
