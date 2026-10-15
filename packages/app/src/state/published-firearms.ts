import { cachedDocuments, DATA_REPOSITORY_URL, synchronise, type ComponentDocument, type DataCache } from '@gordons-legacy/data';
import type { Firearm } from '@gordons-legacy/formats';

/**
 * The published gun database (issue #30): the makers' own specifications, from the data repository, one
 * file per maker.
 *
 * It is fetched when the user looks for their gun and not on a first visit, because a load editor has no
 * use for a few thousand guns until then. What it gives is a convenience, never a measurement of the gun
 * in front of the user: a published barrel length is nominal, and a published mass says what it includes
 * only where the maker said so (`source.massBasis`).
 */

/** Only the guns; the components are synchronised on their own (state/components.ts). */
const FIREARM_KIND = ['firearm'] as const;

/** The guns of the repository's documents, maker after maker, in the order the index lists them. */
export function repositoryFirearms(documents: ReadonlyArray<{ document: ComponentDocument }>): Firearm[] {
  return documents.flatMap(({ document }) => (document.kind === 'firearm' ? document.value : []));
}

/** The guns an earlier visit left in the cache: nothing to download, and all there is offline. */
export async function cachedFirearms(cache: DataCache): Promise<Firearm[]> {
  return repositoryFirearms(await cachedDocuments(cache));
}

/**
 * The repository's guns, downloading the makers the cache does not hold yet. Falls back to the cache
 * when the repository can't be reached, so a search still finds what an earlier visit kept.
 */
export async function fetchFirearms(cache: DataCache, fetch: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>): Promise<Firearm[]> {
  try {
    const report = await synchronise(DATA_REPOSITORY_URL, cache, fetch, FIREARM_KIND);
    return repositoryFirearms(report.documents);
  } catch {
    return cachedFirearms(cache);
  }
}
