/**
 * What every maker's extractor does the same way (issue #30, docs/firearm-data.md): how it identifies
 * itself, how it waits between pages, how it names a gun's file, and how it writes one.
 *
 * Each maker's module keeps what is its own — which pages to read and how to read a figure out of them —
 * and none of them should invent its own politeness or its own file naming. Reading these pages is a
 * guest's work: a named user agent, one page at a time, and the delay the site asks for.
 *
 * Run an extractor with Deno, never with `npx vite-node`, which leaves `import.meta.main` undefined and
 * turns a crawl into a silent no-op:
 *
 *     deno run -A tools/data/firearms/<maker>.ts <output folder> [--limit 5]
 */
import { parseFirearm, serializeFirearm, units, type Firearm } from '@gordons-legacy/formats';

/** Who the crawl says it is, so a site owner can see what it is and ask us to stop. */
export const AGENT = 'gordons-legacy-research/1.0 (+https://github.com/AnnoyingTechnology/gordons-legacy)';

/** A second between pages, where a robots.txt asks for nothing more: allowed is no reason to be rude. */
export const DELAY = 1000;

/** A page's text, with the crawl named. Throws on anything but a 200, so a bad page is skipped, not read. */
export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * A file name from a gun's name: lower case, words joined by hyphens. An ampersand becomes `and`, so
 * that a Smith & Wesson M&P reads as `smith-and-wesson-m-and-p` instead of losing the word altogether.
 */
export function fileName(firearm: Firearm): string {
  return `${firearm.name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.firearm.json`;
}

/** Where a crawl writes, and how many pages it reads (all of them, unless `--limit` says fewer). */
export interface CrawlArguments {
  folder: string;
  limit: number;
}

/**
 * The command line of an extractor, or `undefined` when it has no output folder — in which case the
 * usage line is printed and the exit code set, so a `main` only has to return.
 */
export function crawlArguments(maker: string, argv: readonly string[]): CrawlArguments | undefined {
  const folder = argv.find((argument) => !argument.startsWith('--'));
  if (folder === undefined) {
    console.error(`usage: deno run -A tools/data/firearms/${maker}.ts <output folder> [--limit 5]`);
    process.exitCode = 1;
    return undefined;
  }
  const limitIndex = argv.indexOf('--limit');
  return { folder, limit: limitIndex >= 0 ? Number(argv[limitIndex + 1]) : Infinity };
}

/**
 * The gun as the file holds it, read back through the format's own reader: a record the format rejects
 * is reported instead of written, so no extractor can produce a file the application cannot read.
 */
export function firearmJson(firearm: Firearm): { text: string } | { problem: string } {
  const text = serializeFirearm(firearm);
  const check = parseFirearm(text);
  return check.ok ? { text } : { problem: check.issues.map((issue) => issue.message).join('; ') };
}

/** One gun on the crawl's log: its name and cartridge, then the three figures the simulation uses. */
export function summaryLine(firearm: Firearm): string {
  const { length, twistLength, gunMass } = firearm.barrel;
  return [
    firearm.name.padEnd(46),
    (firearm.cartridge ?? '').padEnd(16),
    `${(length * 1000).toFixed(1)} mm`.padStart(9),
    (twistLength === undefined ? '' : `1:${(twistLength / units.INCH).toFixed(1)}"`).padStart(9),
    (gunMass === undefined ? '' : `${(gunMass * 1000).toFixed(0)} g`).padStart(7),
  ].join(' ');
}
