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
