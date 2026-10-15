/**
 * Reads Glock's published pistol specifications into gun files (issue #30). Maintainer tool: a first
 * extractor, to see what one maker's pages give before any of this is published.
 *
 *     node tools/data/firearms/glock.ts <output folder> [--limit 5]
 *
 * It takes the pages the maker's own sitemap lists, waits a second between them, and keeps only the
 * figures the simulation needs: the barrel length, the mass with an empty magazine (the gun as it
 * recoils, before the cartridges), and the cartridge. Nothing else is taken — no prose, no picture —
 * and every file records where its figures come from, so a user can check them.
 *
 * A published barrel length is nominal. For a pistol it is the chamber-to-muzzle length the engine
 * wants (Glock's 114 mm for a G17 matches the maintainer's own measured load), but the files say
 * `published` all the same, and the application shows that.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, parseFirearm, serializeFirearm, units, type Firearm } from '@gordons-legacy/formats';

const SITEMAP = 'https://us.glock.com/sitemap.xml';
const AGENT = 'gordons-legacy-research/1.0 (+https://github.com/AnnoyingTechnology/gordons-legacy)';
/** A second between pages: their robots.txt allows everything, which is no reason to be rude. */
const DELAY = 1000;

/** One line of a page's technical data: its title, the qualifier under it, and the value. */
interface Specification {
  title: string;
  subtitle: string;
  value: string;
}

export function specifications(page: string): Specification[] {
  const items = page.matchAll(/item-title__[^"]*">([^<]*)<\/h3>\s*<h4[^>]*>\s*([^<]*)<\/h4>\s*<p[^>]*>([^<]*)<\/p>/g);
  return [...items].map(([, title, subtitle, value]) => ({
    title: decode(title ?? ''),
    subtitle: decode(subtitle ?? '').trim(),
    value: decode(value ?? '').trim(),
  }));
}

function decode(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&nbsp;', ' ');
}

/** `114 mm  | 4.49 inch` → metres; `630 g | 22.22 oz` → kilograms. The metric value is the first. */
export function metric(value: string, unit: 'mm' | 'g'): number | undefined {
  const match = new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*${unit}\\b`).exec(value);
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  if (!Number.isFinite(number)) return undefined;
  return unit === 'mm' ? number * units.MILLIMETRE : number * units.GRAM;
}

/**
 * A cartridge a reloader can load for: not Glock's `Training ammunition` of the marking variants, and
 * not a rimfire, which is not handloaded.
 */
export function loadable(caliber: string): boolean {
  return /[0-9]/.test(caliber) && !/training|marking|fx\b|utm/i.test(caliber) && !/\b(22|17)\s*(lr|long rifle|wmr|hmr|short)\b/i.test(caliber);
}

/**
 * The model from a page's title. Their titles carry the site's own words as well, in any order and
 * separated by a pipe or a dash: `GLOCK 17 | GLOCK 17 | The Original`, `Glock Firearms | G45 Gen6`,
 * `GLOCK 17 Gen4 - G17 Gen4 - Buy Guns Online`. The model is the shortest part that starts with a
 * number, or with `G` and a number.
 */
export function modelFrom(title: string): string | undefined {
  const parts = title
    .split(/\||\s[-–]\s/)
    .map((part) => part.trim().replace(/^GLOCK\s*/i, '').replace(/^G(?=\d)/, '').trim())
    .filter((part) => /^\d/.test(part))
    .sort((a, b) => a.length - b.length);
  return parts[0];
}

/** The gun a page describes, or nothing when it is not one a reloader loads for. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | undefined {
  const items = specifications(page);
  const find = (title: string, subtitle?: string) =>
    items.find((item) => item.title.toLowerCase() === title && (subtitle === undefined || item.subtitle.toLowerCase() === subtitle))?.value;
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1]?.trim();
  const caliber = find('caliber');
  const barrel = metric(find('barrel length') ?? '', 'mm');
  // The gun as it recoils: with its magazine, before the cartridges.
  const mass = metric(find('weight', 'with empty magazine') ?? find('weight', 'without magazine') ?? '', 'g');
  const model = title === undefined ? undefined : modelFrom(title);
  if (model === undefined || !caliber || !loadable(caliber) || !barrel) return undefined;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: `Glock ${model}`,
    maker: 'Glock',
    model,
    cartridge: caliber,
    barrel: { name: `Glock ${model}`, length: barrel, ...(mass === undefined ? {} : { gunMass: mass }), gasLeaks: [] },
    source: { kind: 'published', publisher: 'Glock Ges.m.b.H.', url, retrieved },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** A file name from a gun's name: lower case, words joined by hyphens. */
function fileName(firearm: Firearm): string {
  return `${firearm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.firearm.json`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const folder = args.find((argument) => !argument.startsWith('--'));
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Infinity;
  if (!folder) {
    console.error('usage: node tools/data/firearms/glock.ts <output folder> [--limit 5]');
    process.exitCode = 1;
    return;
  }
  const sitemap = await fetchText(SITEMAP);
  const pistols = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, url]) => url!)
    .filter((url) => /\/pistols\/[a-z0-9-]+$/.test(url))
    .slice(0, limit);
  console.log(`${pistols.length} pistol pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  // Two pages sometimes describe the same gun (a commercial and a law-enforcement listing).
  const names = new Set<string>();
  for (const url of pistols) {
    await sleep(DELAY);
    let page: string;
    try {
      page = await fetchText(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const firearm = firearmFrom(page, url, retrieved);
    if (!firearm) {
      skipped.push(`${url}: no cartridge or no barrel length`);
      continue;
    }
    // Written through the format's own reader, so nothing invalid is ever produced.
    const text = serializeFirearm(firearm);
    const check = parseFirearm(text);
    if (!check.ok) {
      skipped.push(`${url}: ${check.issues.map((issue) => issue.message).join('; ')}`);
      continue;
    }
    const file = fileName(firearm);
    if (names.has(file)) {
      skipped.push(`${url}: ${firearm.name} is already written`);
      continue;
    }
    names.add(file);
    writeFileSync(join(folder, file), text);
    written++;
    console.log(
      `${firearm.name.padEnd(28)} ${firearm.cartridge?.padEnd(14)} ` +
        `${(firearm.barrel.length * 1000).toFixed(1)} mm` +
        `${firearm.barrel.gunMass === undefined ? '' : `  ${(firearm.barrel.gunMass * 1000).toFixed(0)} g`}`,
    );
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
