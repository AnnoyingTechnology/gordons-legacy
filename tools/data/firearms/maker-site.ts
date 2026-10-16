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
 * The named entities a maker's pages actually write. Anything numeric is read from its code point, so
 * this table only has to hold the names; a name that is not here is left as it stands, which shows up
 * in a record instead of disappearing silently.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '©',
  deg: '°',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  prime: '′',
  quot: '"',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  times: '×',
  trade: '™',
};

/**
 * A page's text with its entities as the characters a reader sees: `6.5&#215;55` is `6.5×55`.
 *
 * Numeric references are decoded first and named ones after, so that a page writing `&amp;#215;` —
 * which displays the text `&#215;`, not a multiplication sign — is decoded once and not twice.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => codePoint(Number.parseInt(hex, 16), whole))
    .replace(/&#([0-9]+);/g, (whole, digits: string) => codePoint(Number(digits), whole))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

/** The character of a code point, or the reference as written when it is not one. */
function codePoint(value: number, whole: string): string {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
}

/**
 * A stretch of markup as the text a reader sees: tags out, entities decoded, runs of space collapsed,
 * and two spellings settled the way a specification is compared rather than the way it is typeset.
 *
 * - A typographic quote is the plain inch or foot mark: `1:10”` is `1:10"`, and every figure reader in
 *   this folder looks for `"`.
 * - A multiplication sign is `x`: the calibre database writes `5.45 x 39`, and a gun whose cartridge
 *   reads `8×57 JRS` would be chambered for nothing the application can compare it to.
 * - A registered trademark or trademark mark is dropped. It is branding, not part of a gun's identity,
 *   and the same maker prints it on one page and leaves it out on the next — which would otherwise put
 *   the same gun in the corpus twice under two names.
 *
 * A published string read through this function keeps the maker's figure and their wording; only the
 * typesetting is settled, so `source.published` still says what the page states.
 */
export function plainText(markup: string): string {
  return decodeEntities(markup.replace(/<[^>]*>/g, ' '))
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'")
    .replace(/×/g, 'x')
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * The lightest and the heaviest a gun can be, kg. A pocket pistol is about 250 g and a .50 BMG rifle
 * about 14 kg, so anything outside this is not a gun's weight at all: a shipping weight, a figure in
 * the wrong unit, or a page's own placeholder — Savage's pages print `9999 lbs` where they hold no
 * weight, which converts to a 4,535 kg rifle.
 */
const GUN_MASS_RANGE = { lightest: 0.1, heaviest: 25 };

/**
 * A published mass, or nothing when the figure cannot be a gun's. A mass that reaches a record becomes
 * the mass the engine recoils, so a figure nobody can believe must not get that far; the maker's own
 * string stays in `source.published`, where it says what the page printed.
 */
export function plausibleGunMass(mass: number | undefined): number | undefined {
  if (mass === undefined) return undefined;
  return mass >= GUN_MASS_RANGE.lightest && mass <= GUN_MASS_RANGE.heaviest ? mass : undefined;
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
