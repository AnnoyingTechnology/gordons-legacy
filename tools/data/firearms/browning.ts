/**
 * Reads Browning's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/browning.ts <output folder> [--limit 5]
 *
 * browning.com lists its pages in /sitemap.xml; the rifles are under `/products/firearms/rifles/`,
 * discontinued ones (`/discontinued/`) included, because reloaders load for a rifle long after it is
 * out of the catalogue. A rifle page holds one block per chambering, `<div ... id="riflesoption0">`,
 * each a table of titled values (`<b class="spec-key">Twist Rate</b> <span class="spec-val">10"</span>`).
 * One gun is written per block. Only the cartridge, the barrel length, the twist and the mass are
 * taken, and every record cites its page.
 *
 * Browning prints inches and pounds only, and writes fractions (`7 1/2"`, `6 lbs 7 oz`). Its twist
 * rate is the bare number of inches per turn (`10"` means 1:10"). The weight does not say what it
 * includes, so every record says `unstated`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITE = 'https://www.browning.com';
const OUNCE = units.POUND / 16; // kg

/** One titled value of a chambering's table, as plain text. */
export interface Specification {
  title: string;
  value: string;
}

/** One chambering of a page: the titled values of its table. */
export type Chambering = Specification[];

/** The chamberings of a page, in page order. A page without a rifle table has none. */
export function chamberings(page: string): Chambering[] {
  const starts = [...page.matchAll(/<div[^>]*\bid="riflesoption[0-9]+"[^>]*>/g)];
  return starts.map((start, index) => {
    const end = starts[index + 1]?.index ?? page.length;
    const block = page.slice(start.index, end);
    return [...block.matchAll(/<b class="spec-key">(.*?)<\/b>\s*<span class="spec-val">(.*?)<\/span>/gs)].map(([, title, value]) => ({
      title: plainText(title!),
      value: plainText(value!),
    }));
  });
}

/** `22"`, `7 1/2"`, `1/2"` or `13.5"` → inches. Nothing else is a number of inches. */
function inches(text: string): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)?(?:\s*([0-9]+)\s*\/\s*([0-9]+))?\s*("|in\.?)?$/.exec(text.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return undefined;
  const fraction = match[2] === undefined ? 0 : Number(match[2]) / Number(match[3]);
  const total = Number(match[1] ?? 0) + fraction;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

/** A barrel length in metres from `22"` or `26 1/2"`. The mark of the unit is required. */
export function length(text: string | undefined): number | undefined {
  if (text === undefined || !/"|\bin\b/.test(text)) return undefined;
  const value = inches(text);
  return value === undefined ? undefined : value * units.INCH;
}

/** The twist in metres per turn from `10"` or `7 1/2"` (Browning leaves out the `1:`; `1:10"` is read too). */
export function twistLength(text: string | undefined): number | undefined {
  if (text === undefined || !/"|\bin\b/.test(text)) return undefined;
  const value = inches(text.replace(/^\s*1\s*:\s*/, ''));
  return value === undefined ? undefined : value * units.INCH;
}

/** A mass in kilograms from `6 lbs 7 oz`, `7 lbs.` or `9 oz`. Anything not in pounds or ounces is nothing. */
export function mass(text: string | undefined): number | undefined {
  const match = /^\s*(?:([0-9]+(?:\.[0-9]+)?)\s*lbs?\.?)?\s*(?:([0-9]+(?:\.[0-9]+)?)\s*oz\.?)?\s*$/i.exec(text ?? '');
  if (!match || (match[1] === undefined && match[2] === undefined)) return undefined;
  return plausibleGunMass(Number(match[1] ?? 0) * units.POUND + Number(match[2] ?? 0) * OUNCE);
}

/**
 * A cartridge a reloader loads for: it has a figure in it, names one cartridge only, and is no rimfire
 * (22 LR, 22 WMR, 17 HMR, 17 HM2), shotgun gauge or air gun.
 */
export function loadable(cartridge: string): boolean {
  return (
    /[0-9]/.test(cartridge) &&
    !/\s(\/|and|or)\s|,|;|&/i.test(cartridge) &&
    !/gauge|\bga\b|pellet|air/i.test(cartridge) &&
    !/(^|[^0-9])(22|17)\s*(lr|long rifle|wmr|win\.? mag|magnum|hmr|hm2|short|mach 2)\b/i.test(cartridge) &&
    !/^\.?(22|17)\s*(rimfire)?$/i.test(cartridge)
  );
}

/** The model from a page's headline (`X-Bolt 2 Hunter`), falling back on the title before its first dash. */
export function modelFrom(page: string): string | undefined {
  const headline = /<h1[^>]*>(.*?)<\/h1>/s.exec(page)?.[1];
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1];
  const model = plainText(headline ?? '') || plainText(title ?? '').split(/\s[-–|]\s/)[0]?.trim();
  return model ? model.replace(/^Browning\s+/i, '') : undefined;
}

/** A chambering that could not become a gun, and why. */
export interface Skip {
  what: string;
  why: string;
}

/**
 * The guns of one page: one per chambering, and the chamberings left out. Two blocks naming the same
 * cartridge are told apart by their barrel length; identical blocks are one gun, and blocks that still
 * share a name with different figures are left out rather than merged.
 */
export function firearmsFrom(page: string, url: string, retrieved: string): { guns: Firearm[]; skipped: Skip[] } {
  const model = modelFrom(page);
  const guns: Firearm[] = [];
  const skipped: Skip[] = [];
  if (model === undefined) return { guns, skipped: [{ what: url, why: 'no model name' }] };
  const blocks = chamberings(page).map((items) => {
    const find = (title: string) => items.find((item) => item.title.toLowerCase() === title)?.value;
    return { cartridge: find('caliber') ?? '', barrel: find('barrel length'), weight: find('weight'), twist: find('twist rate') };
  });
  const sameCartridge = (cartridge: string) => blocks.filter((block) => block.cartridge === cartridge);
  for (const block of blocks) {
    const barrelLength = length(block.barrel);
    if (block.cartridge === '') {
      skipped.push({ what: model, why: 'no cartridge' });
      continue;
    }
    if (!loadable(block.cartridge)) {
      skipped.push({ what: `${model} ${block.cartridge}`, why: `not loadable (${block.cartridge})` });
      continue;
    }
    if (barrelLength === undefined) {
      skipped.push({ what: `${model} ${block.cartridge}`, why: `no readable barrel length (${block.barrel ?? 'absent'})` });
      continue;
    }
    const twist = twistLength(block.twist);
    const gunMass = mass(block.weight);
    const published = publishedFigures({ barrelLength: block.barrel, weight: block.weight, twist: block.twist });
    const lengths = new Set(sameCartridge(block.cartridge).map((other) => other.barrel));
    const name = `Browning ${model} ${block.cartridge}${lengths.size > 1 ? ` ${block.barrel}` : ''}`;
    const existing = guns.find((gun) => gun.name === name);
    if (existing) {
      const same = JSON.stringify(existing.source?.published) === JSON.stringify(published);
      if (!same) skipped.push({ what: name, why: 'two chamberings of the page share this name with different figures' });
      continue;
    }
    guns.push({
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Browning',
      model,
      cartridge: block.cartridge,
      barrel: {
        name,
        length: barrelLength,
        ...(twist === undefined ? {} : { twistLength: twist }),
        ...(gunMass === undefined ? {} : { gunMass }),
        gasLeaks: [],
      },
      source: {
        kind: 'published',
        publisher: 'Browning',
        url,
        retrieved,
        // The page prints one Weight and does not say what it covers.
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
        published,
      },
    });
  }
  return { guns, skipped };
}

async function main(): Promise<void> {
  const args = crawlArguments('browning', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(`${SITE}/sitemap.xml`);
  const pages = [...new Set([...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!.trim()))]
    .filter((url) => /\/products\/firearms\/rifles\/.+\.html$/.test(url))
    .slice(0, limit);
  console.log(`${pages.length} rifle pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const names = new Map<string, string>();
  for (const url of pages) {
    await sleep(DELAY);
    let page: string;
    try {
      page = await fetchText(url);
    } catch (error) {
      const message = (error as Error).message;
      skipped.push(`${url}: ${message}`);
      // A refusal is a final answer, not a page to retry or get around.
      if (/^(403|429|503)\b/.test(message)) {
        console.log(`STOP: ${message}`);
        break;
      }
      continue;
    }
    const found = firearmsFrom(page, url, retrieved);
    for (const skip of found.skipped) skipped.push(`${url}: ${skip.what}: ${skip.why}`);
    if (found.guns.length === 0 && found.skipped.length === 0) skipped.push(`${url}: no specification table`);
    for (const firearm of found.guns) {
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${firearm.name}: ${json.problem}`);
        continue;
      }
      const file = fileName(firearm);
      const earlier = names.get(file);
      if (earlier !== undefined) {
        skipped.push(`${url}: ${firearm.name} is already written from ${earlier}`);
        continue;
      }
      names.set(file, url);
      writeFileSync(join(folder, file), json.text);
      written++;
      console.log(summaryLine(firearm));
    }
  }
  console.log(`\n${written} guns written to ${folder}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
