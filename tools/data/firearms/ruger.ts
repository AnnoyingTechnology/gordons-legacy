/**
 * Reads Ruger's published firearm specifications into gun files (issue #30). Maintainer tool, built like
 * the Glock one (glock.ts).
 *
 *     deno run -A tools/data/firearms/ruger.ts <output folder> [--limit 5] [--archived <family>]...
 *
 * `--archived gp100` reads that family's sheets from the Wayback Machine instead (archived-pages.ts),
 * for a family whose pages Ruger no longer serves (the GP100 and SP101 stopped answering in October
 * 2026). Each record then cites its snapshot and the day it was captured.
 *
 * Ruger publishes no sitemap (and no robots.txt), so the walk starts at the home page: it follows the
 * product family pages (`/products/<family>/models.html` and `overview.html`), collects the links to the
 * specification sheets they carry (`/products/<family>/specSheets/<model number>.html`), and reads each
 * sheet. It waits a second between pages and keeps only the figures the simulation needs: the cartridge,
 * the barrel length, the twist when Ruger gives one, and the mass of the gun. Nothing else is taken — no
 * prose, no picture, no price — and every file records the sheet its figures come from.
 *
 * A sheet gives each measure twice, in two spans, the metric one hidden by the page's own unit switch:
 * `<span class='measureI'>2.80"</span><span class='measureM hidden'>71 mm</span>`. The metric figure is
 * the one taken; the inch or ounce figure is the fallback. `source.published` keeps both spans, written
 * with a `|` between them (`20.00" | 50.8 cm`), rather than choosing one of them.
 *
 * A published barrel length is nominal. For a rifle it is measured in different ways by different makers,
 * and Ruger does not say how; the files say `published` all the same, and the application shows that.
 */
import { mkdirSync } from 'node:fs';
import { finest, type Reading } from './finest-reading.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, decodeEntities, fetchPage, fetchText, plainText, plausibleGunMass } from './maker-site.ts';
import { archivedPage, archivedPages, snapshotAddress, snapshotDate, type Snapshot } from './archived-pages.ts';
import { writeListing } from './printed-figures.ts';

const SITE = 'https://ruger.com';
const OUNCE = units.POUND / 16; // kg

/** One line of a sheet's data: its title and its value, with the markup of the value kept. */
interface Specification {
  title: string;
  value: string;
}

/** A sheet's text, without the superscripts Ruger wraps its trademark marks in. */
function readable(markup: string): string {
  return plainText(markup.replace(/<sup>.*?<\/sup>/g, ''));
}

/**
 * Every titled line of a sheet. Two shapes carry them: the headline lines (`<li>Caliber: <span ...>`)
 * and the small ones (`<li><em>Barrel Length</em><span>...</span></li>`, whose value may hold nested
 * spans, one per unit).
 */
export function specifications(page: string): Specification[] {
  const headline = [...page.matchAll(/<li>\s*([A-Za-z][A-Za-z ]*?):\s*<span[^>]*>([^<]*)<\/span>\s*<\/li>/g)];
  const small = [...page.matchAll(/<li>\s*<em>([^<]*)<\/em>\s*<span[^>]*>(.*?)<\/span>\s*<\/li>/gs)];
  return [...headline, ...small].map(([, title, value]) => ({ title: readable(title ?? ''), value: value ?? '' }));
}

/** The two renderings of a measure: the inch or ounce one, and the metric one; either may be absent. */
function renderings(value: string): { imperial: string; metric: string } {
  const imperial = /class=['"]measureI['"][^>]*>([^<]*)</.exec(value)?.[1];
  const metric = /class=['"]measureM[^'"]*['"][^>]*>([^<]*)</.exec(value)?.[1];
  return { imperial: readable(imperial ?? ''), metric: readable(metric ?? '') };
}

function reading(text: string, unit: string, si: number): Reading | undefined {
  const match = new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*${unit}(?![a-z])`, 'i').exec(text);
  if (!match) return undefined;
  const printed = match[1]!.replace(',', '.');
  const number = Number(printed);
  if (!Number.isFinite(number)) return undefined;
  const decimals = printed.split('.')[1]?.length ?? 0;
  return { value: number * si, step: 10 ** -decimals * si };
}

/** `71 mm`, `12.7 cm` or `2.80"` → metres, taking whichever the sheet printed to the finer step. */
export function length(value: string): number | undefined {
  const { imperial, metric } = renderings(value);
  return finest([
    reading(metric, 'mm', units.MILLIMETRE),
    reading(metric, 'cm', 1e-2),
    reading(imperial, '("|in\\b|inch)', units.INCH) ?? reading(value, '("|&quot;)', units.INCH),
  ])?.value;
}

/** `317 g` or `1.2 kg` (metric, preferred), else `11.2 oz.` or `6 lbs. 2 oz.` → kilograms. */
export function mass(value: string): number | undefined {
  const { imperial, metric } = renderings(value);
  const pounds = reading(imperial, '(lbs?\\.?)', units.POUND);
  const ounces = reading(imperial, '(oz\\.?)', OUNCE);
  // `6 lbs. 2 oz.` is one figure in two words; its step is the step of the smaller word.
  const customary =
    pounds === undefined && ounces === undefined
      ? undefined
      : { value: (pounds?.value ?? 0) + (ounces?.value ?? 0), step: (ounces ?? pounds!).step };
  return plausibleGunMass(finest([reading(metric, 'g', units.GRAM), reading(metric, 'kg', 1), customary])?.value);
}

/**
 * A measure as the sheet prints it, both renderings when it gives two (`20.00" | 50.8 cm`), so a
 * rounding or a unit mix-up can be traced without fetching the sheet again.
 */
function printed(value: string): string {
  const { imperial, metric } = renderings(value);
  const both = [imperial, metric].map((text) => text.trim()).filter((text) => text !== '');
  return both.length > 0 ? both.join(' | ') : readable(value);
}

/** `1:16" RH` → 0.4064 m, the length of barrel per turn. Anything else, such as `Varies`, is nothing. */
export function twistLength(value: string): number | undefined {
  const match = /^1\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*("|&quot;|in)/i.exec(readable(value).replace(/^\s+/, ''));
  if (!match) return undefined;
  return Number(match[1]) * units.INCH;
}


/**
 * The model from a sheet: its headline, without the trademark signs and without the maker's name
 * (some headlines say `Ruger Vaquero`, and the gun is named `Ruger ...` anyway), and the model number.
 */
export function modelFrom(page: string, modelNumber: string): string | undefined {
  const headline = /<h1>(.*?)<\/h1>/s.exec(page)?.[1];
  if (headline === undefined) return undefined;
  const family = readable(headline.replace(/<sup>.*?<\/sup>/g, '')).replace(/\bRuger[\s-]+/gi, '').trim();
  return family === '' ? undefined : `${family} ${modelNumber}`;
}

/** The gun a sheet describes, or nothing when it is not one a reloader loads for. */
export function firearmFrom(page: string, url: string, retrieved: string): Firearm | undefined {
  const items = specifications(page);
  const find = (title: string) => items.find((item) => item.title.toLowerCase() === title)?.value;
  const modelNumber = readable(find('model number') ?? '');
  const caliber = readable(find('caliber') ?? '');
  const model = modelNumber === '' ? undefined : modelFrom(page, modelNumber);
  const barrelValue = find('barrel length') ?? '';
  const weightValue = find('weight') ?? '';
  const twistValue = find('twist') ?? '';
  const barrel = length(barrelValue);
  const gunMass = mass(weightValue);
  const twist = twistLength(twistValue);
  // Ruger prints one Weight and does not say what it includes, so the record says so rather than
  // claiming it is the gun as it recoils.
  const published = Object.fromEntries(
    ([['barrelLength', barrelValue], ['weight', weightValue], ['twist', twistValue]] as const)
      .map(([key, value]) => [key, printed(value)] as const)
      .filter(([, value]) => value !== ''),
  );
  if (model === undefined || caliber === '' || !loadableCartridge(caliber) || barrel === undefined) return undefined;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name: `Ruger ${model}`,
    maker: 'Ruger',
    model,
    cartridge: caliber,
    barrel: {
      name: `Ruger ${model}`,
      length: barrel,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: { kind: 'published', publisher: 'Sturm, Ruger & Co., Inc.', url, retrieved, massBasis: 'unstated', published },
  };
}

/**
 * The product family pages and the specification sheets a page links to, as full addresses. A family's
 * models page links its sheets by relative address (`specSheets/5801.html`, sometimes with `?buy=1`).
 */
export function links(page: string, pageUrl: string): { families: string[]; sheets: string[] } {
  const hrefs = [...page.matchAll(/href="([^"]*)"/g)].map(([, href]) => decodeEntities(href!).replace(/[?#].*$/, ''));
  const absolute = (href: string) => new URL(href, pageUrl).href;
  const families = hrefs.filter((href) => /^\/products\/[A-Za-z0-9-]+\/(models|overview)\.html$/.test(href));
  const sheets = hrefs.filter((href) => /^(\/products\/[A-Za-z0-9-]+\/)?specSheets\/[0-9A-Za-z-]+\.html$/.test(href));
  return { families: families.map(absolute), sheets: sheets.map(absolute) };
}

/**
 * The addresses of the specification sheets, found from the home page through the family pages. A sheet
 * page is linked from its family's models page by a relative address, so the family it belongs to is
 * the page it was found on.
 */
async function findSheets(limit: number): Promise<string[]> {
  const home = await fetchText(`${SITE}/`);
  const queue = [...new Set(links(home, `${SITE}/`).families)];
  const seen = new Set(queue);
  const sheets = new Set<string>();
  for (let index = 0; index < queue.length && sheets.size < limit; index++) {
    const family = queue[index]!;
    let page: string;
    try {
      page = await fetchPage(family);
    } catch (error) {
      console.log(` - ${family}: ${(error as Error).message}`);
      continue;
    }
    const found = links(page, family);
    for (const sheet of found.sheets) sheets.add(sheet);
    for (const next of found.families) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  console.log(`${queue.length} family pages, ${sheets.size} specification sheets`);
  return [...sheets].slice(0, limit);
}

/** The families named by `--archived`, read from the archive. */
export function archivedFamilies(argv: readonly string[]): string[] {
  return argv.flatMap((argument, index) => (argument === '--archived' && argv[index + 1] && /^[a-z0-9-]+$/i.test(argv[index + 1]!) ? [argv[index + 1]!] : []));
}

async function main(): Promise<void> {
  const args = crawlArguments('ruger', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sheets = await findSheets(limit);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const skipped: string[] = [];
  const taken = new Map<string, Firearm>();
  for (const url of sheets) {
    let page: string;
    try {
      page = await fetchPage(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const firearm = firearmFrom(page, url, retrieved);
    if (!firearm) {
      const caliber = readable(specifications(page).find((item) => item.title.toLowerCase() === 'caliber')?.value ?? '');
      skipped.push(`${url}: ${caliber === '' ? 'no cartridge' : loadableCartridge(caliber) ? 'no barrel length' : `not loadable (${caliber})`}`);
      continue;
    }
    const outcome = writeListing(folder, taken, firearm);
    if ('skipped' in outcome) skipped.push(`${url}: ${outcome.skipped}`);
    else if (outcome.note) skipped.push(`${url}: ${outcome.note}`);
  }
  for (const family of archivedFamilies(process.argv.slice(2))) {
    let snapshots: Snapshot[];
    try {
      snapshots = (await archivedPages(`ruger.com/products/${family}/specSheets/`)).slice(0, limit);
    } catch (error) {
      skipped.push(`${family}: the archive's index did not answer (${(error as Error).message})`);
      continue;
    }
    console.log(`${family}: ${snapshots.length} archived sheets`);
    for (const snapshot of snapshots) {
      const address = snapshotAddress(snapshot);
      let page: string;
      try {
        page = await archivedPage(snapshot);
      } catch (error) {
        skipped.push(`${address}: ${(error as Error).message}`);
        continue;
      }
      const firearm = firearmFrom(page, address, retrieved);
      if (!firearm) {
        skipped.push(`${address}: no cartridge or no barrel length`);
        continue;
      }
      const archived: Firearm = { ...firearm, source: { ...firearm.source!, archived: snapshotDate(snapshot) } };
      const outcome = writeListing(folder, taken, archived);
      if ('skipped' in outcome) skipped.push(`${address}: ${outcome.skipped}`);
      else if (outcome.note) skipped.push(`${address}: ${outcome.note}`);
    }
  }
  console.log(`\n${taken.size} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} pages skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
