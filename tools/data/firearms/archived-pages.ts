/**
 * Pages a maker no longer serves, read from the Internet Archive's Wayback Machine (maintainer,
 * 2026-11-03, #30): Ruger's GP100 and SP101 pages stopped answering between two runs, and a catalogue
 * will lose pages again. A gun read this way cites the snapshot, not the maker's address, and says when
 * it was archived (`source.archived`), so nobody takes it for a page read today.
 *
 * The archive's index (the CDX API, https://archive.org/developers/wayback-cdx-server.html) answers a
 * query with a JSON table whose first row names the columns. A snapshot is fetched in its raw form
 * (`id_` after the timestamp), the page as archived without the archive's toolbar around it.
 */
import { DELAY, fetchText, sleep } from './maker-site.ts';

const INDEX = 'https://web.archive.org/cdx/search/cdx';
const ARCHIVE = 'https://web.archive.org/web';

/** One archived capture of a page. */
export interface Snapshot {
  /** The page's own address, as the archive recorded it. */
  original: string;
  /** When it was captured, YYYYMMDDhhmmss. */
  timestamp: string;
}

/** The index's query for the captures, answered 200, of every page under `prefix`. */
export function indexQuery(prefix: string): string {
  const parameters = new URLSearchParams({ url: prefix, matchType: 'prefix', output: 'json', filter: 'statuscode:200', fl: 'original,timestamp' });
  return `${INDEX}?${parameters}`;
}

/**
 * The latest capture of each page in an index answer. The archive records one page under several
 * addresses over the years (`http://www.ruger.com:80/…`, `https://ruger.com/…`): they are one page,
 * compared without scheme, `www.`, default port, query and fragment, and the capture keeps the address
 * it was made of. A malformed answer gives no snapshot rather than a guess.
 */
export function latestSnapshots(answer: string): Snapshot[] {
  let rows: unknown;
  try {
    rows = JSON.parse(answer);
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const [header, ...captures] = rows as unknown[][];
  const originalColumn = header?.indexOf('original') ?? -1;
  const timestampColumn = header?.indexOf('timestamp') ?? -1;
  if (originalColumn < 0 || timestampColumn < 0) return [];
  const latest = new Map<string, Snapshot>();
  for (const capture of captures) {
    const original = capture[originalColumn];
    const timestamp = capture[timestampColumn];
    if (typeof original !== 'string' || typeof timestamp !== 'string' || !/^\d{14}$/.test(timestamp)) continue;
    // Compared by the page alone; fetched and cited by the address the archive captured, query included.
    const page = original.replace(/[?#].*$/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/:(80|443)\//, '/');
    const known = latest.get(page);
    if (known === undefined || known.timestamp < timestamp) latest.set(page, { original, timestamp });
  }
  return [...latest.values()];
}

/** The snapshot's address as a reader follows it, cited in a record. */
export function snapshotAddress(snapshot: Snapshot): string {
  return `${ARCHIVE}/${snapshot.timestamp}/${snapshot.original}`;
}

/** The day the snapshot was captured, YYYY-MM-DD. */
export function snapshotDate(snapshot: Snapshot): string {
  const { timestamp } = snapshot;
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

/** The latest capture of every page under `prefix`. */
export async function archivedPages(prefix: string): Promise<Snapshot[]> {
  return latestSnapshots(await patiently(indexQuery(prefix)));
}

/** A snapshot's page, raw. */
export async function archivedPage(snapshot: Snapshot): Promise<string> {
  return patiently(`${ARCHIVE}/${snapshot.timestamp}id_/${snapshot.original}`);
}

/** Waits between tries of a refused request: the archive answers 503 for a while, then again. */
const RETRY_DELAYS = [DELAY, 30_000, 120_000];

/**
 * A request to the archive, a second after the last, tried again twice after longer waits when it is
 * refused: an archive that stops answering for a minute should not end a crawl of an hour. Throws
 * when the last try fails too.
 */
async function patiently(url: string): Promise<string> {
  let failure: unknown;
  for (const delay of RETRY_DELAYS) {
    await sleep(delay);
    try {
      return await fetchText(url);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}
