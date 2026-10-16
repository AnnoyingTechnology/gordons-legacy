/**
 * Reads Glock's published pistol specifications into gun files (issue #30). Maintainer tool: a first
 * extractor, to see what one maker's pages give before any of this is published.
 *
 *     deno run -A tools/data/firearms/glock.ts <output folder> [--limit 5]
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
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';

const SITEMAP = 'https://us.glock.com/sitemap.xml';

/** One line of a page's technical data: its title, the qualifier under it, and the value. */
interface Specification {
  title: string;
  subtitle: string;
  value: string;
}

export function specifications(page: string): Specification[] {
  const items = page.matchAll(/item-title__[^"]*">([^<]*)<\/h3>\s*<h4[^>]*>\s*([^<]*)<\/h4>\s*<p[^>]*>([^<]*)<\/p>/g);
  return [...items].map(([, title, subtitle, value]) => ({
    title: plainText(title ?? ''),
    subtitle: plainText(subtitle ?? ''),
    value: plainText(value ?? ''),
  }));
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

/** A figure as the page prints it, spaces collapsed: `111 mm | 4.37 inch`. */
function printed(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The gun a page describes, or nothing when it is not one a reloader loads for. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | undefined {
  const items = specifications(page);
  const find = (title: string, subtitle?: string) =>
    items.find((item) => item.title.toLowerCase() === title && (subtitle === undefined || item.subtitle.toLowerCase() === subtitle))?.value;
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1]?.trim();
  const caliber = find('caliber');
  const barrelValue = find('barrel length');
  const barrel = metric(barrelValue ?? '', 'mm');
  // The gun as it recoils: with its magazine, before the cartridges. Which of their three figures that
  // is travels with the record, since a mass means nothing without knowing what it includes.
  const withEmptyMagazine = find('weight', 'with empty magazine');
  const withoutMagazine = find('weight', 'without magazine');
  const weight = withEmptyMagazine ?? withoutMagazine;
  const massBasis = withEmptyMagazine !== undefined ? 'empty-magazine' : withoutMagazine !== undefined ? 'without-magazine' : undefined;
  const mass = plausibleGunMass(metric(weight ?? '', 'g'));
  const model = title === undefined ? undefined : modelFrom(title);
  if (model === undefined || !caliber || !loadable(caliber) || barrelValue === undefined || !barrel) return undefined;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: `Glock ${model}`,
    maker: 'Glock',
    model,
    cartridge: caliber,
    barrel: { name: `Glock ${model}`, length: barrel, ...(mass === undefined ? {} : { gunMass: mass }), gasLeaks: [] },
    source: {
      kind: 'published',
      publisher: 'Glock Ges.m.b.H.',
      url,
      retrieved,
      ...(massBasis === undefined ? {} : { massBasis }),
      published: { barrelLength: printed(barrelValue), ...(weight === undefined ? {} : { weight: printed(weight) }) },
    },
  };
}

async function main(): Promise<void> {
  const args = crawlArguments('glock', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
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
    const json = firearmJson(firearm);
    if ('problem' in json) {
      skipped.push(`${url}: ${json.problem}`);
      continue;
    }
    const file = fileName(firearm);
    if (names.has(file)) {
      skipped.push(`${url}: ${firearm.name} is already written`);
      continue;
    }
    names.add(file);
    writeFileSync(join(folder, file), json.text);
    written++;
    console.log(summaryLine(firearm));
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
