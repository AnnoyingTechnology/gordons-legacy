/**
 * The reading loop the American rifle extractors share (issue #30): fetch each page at the pace the
 * maker's robots.txt allows, turn it into guns, write each through the format's own reader, and print
 * what was written and what was skipped and why.
 *
 * An extractor supplies the pages and the function that reads one; everything about politeness, file
 * naming and the write stays in maker-site.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Firearm } from '@gordons-legacy/formats';
import { DELAY, fetchPage, fileName, firearmJson, summaryLine } from './maker-site.ts';
import { distinguished, firearmOf, type Configuration } from './rifle-figures.ts';

/** What reading one page gives: the configurations it publishes, and why any were left out. */
export interface PageReading {
  configurations: Configuration[];
  /** Reasons, in words, for what the reader itself left out (a rimfire, a barrel with no length). */
  left: string[];
}

export interface CrawlOptions {
  folder: string;
  /** The pages to read, in order. */
  pages: string[];
  /** Milliseconds between two requests: at least the shared DELAY, more where robots.txt asks. */
  delay?: number;
  /** Reads one page. `retrieved` is the day, YYYY-MM-DD. */
  read: (page: string, url: string, retrieved: string) => PageReading;
}

/** Fetches and writes; returns the number of guns written. */
export async function crawl(options: CrawlOptions): Promise<number> {
  mkdirSync(options.folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const delay = Math.max(options.delay ?? DELAY, DELAY);
  const written = new Map<string, Firearm>();
  const skipped: string[] = [];
  for (const url of options.pages) {
    let page: string;
    try {
      page = await fetchPage(url, delay);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const reading = options.read(page, url, retrieved);
    for (const reason of reading.left) skipped.push(`${url}: ${reason}`);
    const { kept, dropped } = distinguished(reading.configurations);
    for (const reason of dropped) skipped.push(`${url}: ${reason}`);
    if (kept.length === 0 && reading.left.length === 0) skipped.push(`${url}: no gun with a cartridge and a barrel length`);
    for (const configuration of kept) {
      const firearm = firearmOf(configuration);
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${firearm.name}: ${json.problem}`);
        continue;
      }
      const file = fileName(firearm);
      const earlier = written.get(file);
      if (earlier !== undefined) {
        // Settled before serialising: the first listing stays, and the disagreement is printed.
        skipped.push(`${url}: ${firearm.name} is already written from ${earlier.source?.url}${disagreement(earlier, firearm)}`);
        continue;
      }
      written.set(file, firearm);
      writeFileSync(join(options.folder, file), json.text);
      console.log(summaryLine(firearm));
    }
  }
  console.log(`\n${written.size} guns written to ${options.folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
  return written.size;
}

/** What two records of one name disagree on, for the log; empty when they agree. */
function disagreement(first: Firearm, second: Firearm): string {
  const parts: string[] = [];
  const fields = [
    ['barrel', first.barrel.length, second.barrel.length],
    ['twist', first.barrel.twistLength, second.barrel.twistLength],
    ['mass', first.barrel.gunMass, second.barrel.gunMass],
  ] as const;
  for (const [what, a, b] of fields) if (a !== b) parts.push(`${what} ${a ?? 'none'} in the record, ${b ?? 'none'} on this page`);
  return parts.length > 0 ? ` (${parts.join('; ')})` : '';
}
