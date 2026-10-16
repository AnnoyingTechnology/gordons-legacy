/**
 * The pages a crawl has already read, kept on disk so that a parser can be improved without asking a
 * site for them again (issue #30, docs/firearm-data.md).
 *
 * A crawl of a large catalogue takes an hour at one page a second, and a figure read wrongly is only
 * found afterwards — by `check-corpus.ts`, or by a person looking at a record. Without a cache, every
 * correction costs the site another full crawl; with one, the pages are fetched once and the extractor
 * runs again over the files in a few seconds. It is also the politer arrangement: the same page is not
 * fetched twice because our reading of it was wrong.
 *
 * It is off unless a folder is named, so a plain crawl stays a plain crawl:
 *
 *     FIREARM_PAGE_CACHE=/tmp/gl/pages deno run -A tools/data/firearms/cz.ts /tmp/gl/corpus-cz
 *
 * A cached page is the markup as it was served on the day the file says. It is scratch data, never a
 * source of record: a published gun cites the maker's address and the day it was read, and a refresh
 * means emptying the cache (or naming another folder) and fetching again.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The folder the cache is in, or nothing when no cache was asked for. */
export function cacheFolder(): string | undefined {
  const folder = process.env['FIREARM_PAGE_CACHE'];
  return folder === undefined || folder === '' ? undefined : folder;
}

/**
 * The file a page's markup is kept in. The address is hashed because it has to become one file name:
 * a URL holds slashes, question marks and percent escapes, and two different addresses must never land
 * on the same file. The listing beside it (`pages.tsv`) is what makes the folder readable by a person.
 */
export function cacheFile(folder: string, url: string): string {
  return join(folder, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.html`);
}

/** The markup kept for an address, or nothing when the cache has not seen it. */
export function cachedPage(url: string): string | undefined {
  const folder = cacheFolder();
  if (folder === undefined) return undefined;
  const file = cacheFile(folder, url);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** Keeps a page that has just been fetched, and notes it in the folder's listing. */
export function keepPage(url: string, markup: string): void {
  const folder = cacheFolder();
  if (folder === undefined) return;
  mkdirSync(folder, { recursive: true });
  const file = cacheFile(folder, url);
  writeFileSync(file, markup);
  appendFileSync(join(folder, 'pages.tsv'), `${new Date().toISOString().slice(0, 10)}\t${markup.length}\t${file}\t${url}\n`);
}
