// Public API of @gordons-legacy/data.

export {
  COMPONENT_KINDS,
  DATA_REPOSITORY_URL,
  type ComponentDocument,
  type ComponentKind,
  type GrtCatalogueKind,
  type DataIndex,
  type DataIndexEntry,
  type Provenance,
} from './repository.ts';
export { cachedDocuments, readDocument, sha256, synchronise, type CachedFile, type DataCache, type SyncReport } from './sync.ts';
export { validateRepository, type RepositoryProblem } from './validation.ts';
export { BARREL_LENGTH_RANGE, GUN_MASS_RANGE, implausibleFigures, TWIST_LENGTH_RANGE } from './firearm-plausibility.ts';
