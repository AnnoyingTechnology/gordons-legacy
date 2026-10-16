/**
 * Reads Winchester Repeating Arms' published rifle specifications into gun files (issue #30).
 * Maintainer tool.
 *
 *     deno run -A tools/data/firearms/winchester.ts <output folder> [--limit 5]
 *
 * winchesterguns.com is an Adobe Experience Manager site, the same CMS as Browning's. Its `robots.txt`
 * answers 404 (a page, not a file), so nothing is forbidden and nothing asks for a delay; the usual
 * second between pages applies all the same.
 *
 * The family pages (`/products/rifles/xpr.html`) hold no product links in their HTML — the list is
 * filled in by script from a JSON file the page names — so the walk reads the sitemap instead, which
 * is a documented, public list: `/products/rifles/<family>/<model>.html` and the discontinued rifles
 * (`/products/discontinued/rifles/<model>.html`). Shotguns are not read.
 *
 * Some of the sitemap's addresses are stale: they answer `308` with a `Location` that is the same
 * address, forever. Such a page is not followed (a redirect loop is twenty requests nobody asked for),
 * it is skipped and counted.
 *
 * A product page lists one specification block per chambering (`<div class="tab-pane" id="riflesoption0">`
 * holding `<b class="spec-key">Caliber</b> <span class="spec-val">308 Win</span>` cells), each with its
 * own barrel length, weight and twist. One record is built per block. The twist is printed as the
 * inches per turn alone (`10"`, `18 3/4"`), and lengths may carry a fraction.
 *
 * Only the cartridge, the barrel length, the twist and the weight are taken. The weight is printed
 * without saying what it includes (`6 lbs 12 oz`), so the record says `unstated`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { AGENT, crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { cachedPage, keepPage } from './page-cache.ts';
import { publishedFigures } from './published-figures.ts';

const SITE = 'https://www.winchesterguns.com';
const OUNCE = units.POUND / 16; // kg

/** One chambering's block of a product page: its titled cells, keyed by lower-case title. */
export type SpecificationBlock = Record<string, string>;

/** The specification blocks of a page, one per chambering, in page order. */
export function specificationBlocks(page: string): SpecificationBlock[] {
  const starts = [...page.matchAll(/<div class="tab-pane[^"]*" id="[^"]*">/g)].map((match) => match.index!);
  return starts.map((start, index) => {
    const block = page.slice(start, starts[index + 1] ?? page.length);
    const cells = [...block.matchAll(/<b class="spec-key">([^<]*)<\/b>\s*<span class="spec-val">([^<]*)<\/span>/g)];
    const specification: SpecificationBlock = {};
    for (const [, key, value] of cells) {
      const title = plainText(key!).toLowerCase();
      if (!(title in specification)) specification[title] = plainText(value!);
    }
    return specification;
  });
}

/** The model from a page's headline: `Model 70 Extreme Weather SS`, without the maker's name. */
export function modelFromHeadline(page: string): string | undefined {
  const headline = /<h1[^>]*>([^<]*)<\/h1>/.exec(page)?.[1];
  const model = headline === undefined ? undefined : plainText(headline).replace(/^Winchester\s+/i, '');
  return model ? model : undefined;
}

/** Inches from `22"`, `24.5"` or `18 3/4"`; the mark of the inch is required, a bare number is not guessed at. */
function inches(text: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*(?:"|in\b)/.exec(text.trim());
  if (!match) return undefined;
  const fraction = match[2] === undefined ? 0 : Number(match[2]) / Number(match[3]);
  const value = Number(match[1]) + (Number.isFinite(fraction) ? fraction : 0);
  return value > 0 ? value * units.INCH : undefined;
}

/** `22"` or `26 1/2"` → metres. */
export function length(text: string | undefined): number | undefined {
  return inches(text ?? '');
}

/** The turn of the rifling in metres: Winchester prints the inches per turn alone, `10"` or `9 1/2"`; `1:10"` also reads. */
export function twistLength(text: string | undefined): number | undefined {
  return inches((text ?? '').replace(/^\s*1\s*:\s*/, ''));
}

/** `6 lbs 12 oz`, `7 lbs 0 oz` or `7.5 lbs` → kilograms; a figure no gun has (`0 lbs 0 oz`) is nothing. */
export function mass(text: string | undefined): number | undefined {
  const pounds = /(\d+(?:\.\d+)?)\s*lbs?\b/i.exec(text ?? '')?.[1];
  const ounces = /(\d+(?:\.\d+)?)\s*oz\b/i.exec(text ?? '')?.[1];
  if (pounds === undefined && ounces === undefined) return undefined;
  return plausibleGunMass(Number(pounds ?? 0) * units.POUND + Number(ounces ?? 0) * OUNCE);
}

/**
 * Why a cartridge is not one a reloader loads for, or `undefined` when it is: no figure in it, a
 * rimfire (22 LR, 22 WMR, 17 HMR, 17 WSM, 17 Mach 2 written `17 M 2`, 21 Sharp), or several cartridges named at once (`357-38`
 * is the .357 Magnum and the .38 Special, `/` joins two others; `300 H&H MAG` is one).
 */
export function notLoadable(cartridge: string): string | undefined {
  if (!/[0-9]/.test(cartridge)) return 'no cartridge';
  if (/(^|[^0-9])(22|17)\s*(lr|long rifle|wmr|win\.? mag|hmr|short|wsm|mach 2|m 2|hm2)\b/i.test(cartridge) || /^21 sharp$/i.test(cartridge.trim())) return 'rimfire';
  if (/^357-38$/.test(cartridge.trim()) || /\/|\bor\b/i.test(cartridge)) return 'several cartridges';
  return undefined;
}

/** What a block gives that decides whether it is a gun, in words, for the log; `undefined` when it is one. */
function whyNotAGun(block: SpecificationBlock): string | undefined {
  const cartridge = block['caliber'] ?? '';
  const reason = notLoadable(cartridge);
  if (reason !== undefined) return cartridge === '' ? reason : `${reason} (${cartridge})`;
  return length(block['barrel length']) === undefined ? `no barrel length (${cartridge})` : undefined;
}

/**
 * The guns of one page: one per chambering block. When a page lists one cartridge twice (two barrel
 * lengths), each such gun takes its barrel length into its name, so that no two share one.
 */
export function firearmsFrom(page: string, url: string, retrieved: string): { firearms: Firearm[]; skipped: string[] } {
  const model = modelFromHeadline(page);
  const firearms: Firearm[] = [];
  const skipped: string[] = [];
  if (model === undefined) return { firearms, skipped: [`${url}: no headline`] };
  const blocks = specificationBlocks(page);
  if (blocks.length === 0) return { firearms, skipped: [`${url}: no specification block`] };
  const repeated = (cartridge: string) => blocks.filter((block) => block['caliber'] === cartridge).length > 1;
  for (const block of blocks) {
    const reason = whyNotAGun(block);
    if (reason !== undefined) {
      skipped.push(`${url}: ${reason}`);
      continue;
    }
    const cartridge = block['caliber']!;
    const barrelLength = length(block['barrel length'])!;
    const twist = twistLength(block['twist rate']);
    const gunMass = mass(block['weight']);
    const name = `Winchester ${model} ${cartridge}${repeated(cartridge) ? ` ${block['barrel length']}` : ''}`;
    firearms.push({
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Winchester',
      model,
      cartridge,
      barrel: {
        name,
        length: barrelLength,
        ...(twist === undefined ? {} : { twistLength: twist }),
        ...(gunMass === undefined ? {} : { gunMass }),
        gasLeaks: [],
      },
      source: {
        kind: 'published',
        publisher: 'Winchester Repeating Arms',
        url,
        retrieved,
        // One Weight, with no word on what it includes.
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
        published: publishedFigures({ caliber: cartridge, barrelLength: withDecimalFraction(block['barrel length']), weight: block['weight'], twist: publishedTwist(block['twist rate']) }),
      },
    });
  }
  return { firearms, skipped };
}

/**
 * A printed measure with its fraction written as a decimal when that is exact (`18 1/2"` is `18.5"`,
 * `9 3/4"` is `9.75"`): the corpus checker reads a number and a unit, not a fraction, and the figure is
 * the same. A fraction that is not exact in decimals is left as printed.
 */
export function withDecimalFraction(printed: string | undefined): string | undefined {
  return printed?.replace(/(\d+)\s+(\d+)\/(\d+)/, (whole, integer: string, numerator: string, denominator: string) => {
    const fraction = Number(numerator) / Number(denominator);
    return Number.isFinite(fraction) && Number.isInteger(fraction * 1024) ? String(Number(integer) + fraction) : whole;
  });
}

/**
 * The twist as `source.published` keeps it. The page prints the inches per turn alone (`10"`), under a
 * label that says Twist Rate; the record writes it the way every other maker's twist is written and the
 * corpus checker reads it, `1:10"`, so that the figure and its string can be compared. Anything else
 * stays as it is.
 */
export function publishedTwist(printed: string | undefined): string | undefined {
  return printed !== undefined && twistLength(printed) !== undefined && !/^\s*1\s*:/.test(printed) ? `1:${withDecimalFraction(printed)!.trim()}` : printed;
}

/**
 * Of guns that share a name, the one they all agree on. Pages list one cartridge and barrel length
 * more than once when they stand for several production runs (a discontinued page can hold three
 * `223 Rem` at 24 inches with three different weights), and a record built from any one of them would
 * be a pick, while an average would be a figure no one printed. Where the figures agree the first is
 * kept; where they differ, none is, and the disagreement is reported.
 */
export function settleNames(firearms: Firearm[]): { kept: Firearm[]; skipped: string[] } {
  const byName = new Map<string, Firearm[]>();
  for (const firearm of firearms) byName.set(firearm.name, [...(byName.get(firearm.name) ?? []), firearm]);
  const kept: Firearm[] = [];
  const skipped: string[] = [];
  for (const [name, candidates] of byName) {
    const first = candidates[0]!;
    const figures = (firearm: Firearm) => JSON.stringify([firearm.barrel.length, firearm.barrel.twistLength, firearm.barrel.gunMass]);
    if (candidates.every((candidate) => figures(candidate) === figures(first))) {
      kept.push(first);
      skipped.push(...candidates.slice(1).map((candidate) => `${candidate.source?.url}: ${name} is listed again with the same figures`));
    } else {
      const printed = candidates.map((candidate) => Object.values(candidate.source?.published ?? {}).join(' / ')).join(' | ');
      skipped.push(`${first.source?.url}: ${name} is listed ${candidates.length} times with different figures, none kept (${printed})`);
    }
  }
  return { kept, skipped };
}

/** The product pages of the sitemap: current and discontinued rifles, family overviews left out. */
export function rifleAddresses(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, address]) => address!.trim())
    .filter((address) => /\/products\/(rifles\/[a-z0-9-]+|discontinued\/rifles)\/[a-z0-9-]+\.html$/.test(address) && !address.endsWith('/overview.html'));
}

/**
 * A page's text, or why there is none. A page that redirects to itself is named so, and not followed.
 *
 * The redirects are why this does not use the shared `fetchPage`, and the cache is consulted by hand
 * instead (page-cache.ts): a page reached through a redirect is kept under the address the sitemap
 * gave, which is the address a second run will ask for.
 */
async function readPage(url: string): Promise<{ page: string } | { problem: string }> {
  const kept = cachedPage(url);
  if (kept !== undefined) return { page: kept };
  try {
    await sleep(DELAY);
    const response = await fetch(url, { headers: { 'user-agent': AGENT }, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const target = new URL(response.headers.get('location') ?? '', url).href;
      await response.body?.cancel();
      if (target === url) return { problem: 'redirects to itself' };
      await sleep(DELAY);
      const page = await fetchText(target);
      keepPage(url, page);
      return { page };
    }
    if (!response.ok) return { problem: `${response.status}` };
    const page = await response.text();
    keepPage(url, page);
    return { page };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

async function main(): Promise<void> {
  const args = crawlArguments('winchester', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = rifleAddresses(await fetchText(`${SITE}/sitemap.xml`)).slice(0, limit);
  console.log(`${pages.length} rifle pages in the sitemap`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let pagesRead = 0;
  const skipped: string[] = [];
  const found: Firearm[] = [];
  for (const url of pages) {
    const result = await readPage(url);
    if ('problem' in result) {
      skipped.push(`${url}: ${result.problem}`);
      continue;
    }
    pagesRead++;
    const read = firearmsFrom(result.page, url, retrieved);
    found.push(...read.firearms);
    skipped.push(...read.skipped);
  }
  // Names are settled over the whole crawl, before anything is serialised.
  const settled = settleNames(found);
  skipped.push(...settled.skipped);
  let written = 0;
  for (const firearm of settled.kept) {
    const json = firearmJson(firearm);
    if ('problem' in json) {
      skipped.push(`${firearm.source?.url}: ${json.problem}`);
      continue;
    }
    writeFileSync(join(folder, fileName(firearm)), json.text);
    written++;
    console.log(summaryLine(firearm));
  }
  console.log(`\n${pagesRead} pages read, ${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
