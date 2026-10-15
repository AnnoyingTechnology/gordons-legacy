import type { CaliberDefinition, Projectile, Propellant } from '@gordons-legacy/formats';

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

export type ComponentKind = 'powder' | 'projectile' | 'caliber';

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
  | { format: 'gordons-legacy.component'; version: 1; kind: 'caliber'; provenance: Provenance; value: CaliberDefinition };
