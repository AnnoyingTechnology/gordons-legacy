import type { CachedFile, DataCache } from '@gordons-legacy/data';
import { indexedDbStore } from './indexed-db.ts';

/** The data repository's files, kept in IndexedDB by their path (the store needs an `id`). */
export function indexedDbDataCache(): DataCache {
  const store = indexedDbStore<CachedFile & { id: string }>('data');
  return {
    list: () => store.list(),
    put: (file) => store.put({ ...file, id: file.path }),
    remove: (path) => store.remove(path),
  };
}
