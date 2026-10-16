/**
 * Desert Tech's public product pages embed the specifications displayed for each configuration in
 * Angular's ng-state JSON. Read that page, never the /api/ paths disallowed by robots.txt.
 *
 *     deno run -A tools/data/firearms/desert-tech.ts <output folder> [--limit 5]
 *
 * First run survey-site.ts deserttech.com and review robots.txt, including its path restrictions.
 *
 * Only variant.specs describes that configuration. The product's specs describe the selected variant;
 * weightLb is SHIPPING weight. Neither may fill a missing figure on another configuration.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { loadableCartridge } from './check-corpus.ts';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, plainText, plausibleGunMass, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITE = 'https://deserttech.com';

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string { return typeof value === 'string' ? plainText(value) : ''; }

/** Complete gun families from the sitemap; no kits, receivers, accessories, airsoft or rimfire. */
export function productPages(sitemap: string): string[] {
  return [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url!))]
    .filter((url) => /^https:\/\/deserttech\.com\/(?:(?:srs-m2|srs-a2-covert|hti|mdrx|wlvrn|wlvrn-micron)-rifle|quattro-15-(?:rifle|pistol)|quattro-15-lite-(?:rifle|pistol)-[a-z0-9-]+)$/.test(url));
}

/** Unit marks are required; a bare twist ratio is kept as a published string but not converted. */
function inches(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(?:"|in(?:ch(?:es)?)?\.?)$/i.exec(value);
  return match && Number(match[1]) > 0 ? Number(match[1]) * units.INCH : undefined;
}

function mass(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*lbs?\.?$/i.exec(value);
  return plausibleGunMass(match ? Number(match[1]) * units.POUND : undefined);
}

/** Facts from each configuration, including its SKU so two finishes cannot overwrite each other. */
export function firearmsFrom(page: string, url: string, retrieved: string): { firearms: Firearm[]; skipped: string[] } {
  const result: { firearms: Firearm[]; skipped: string[] } = { firearms: [], skipped: [] };
  const script = /<script\b[^>]*\bid=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i.exec(page)?.[1];
  if (!script) return { ...result, skipped: ['no public product state'] };
  const state = object(JSON.parse(script));
  const product = Object.values(state ?? {}).map((entry) => object(object(entry)?.['b']))
    .filter((body) => body?.['kind'] === 'product').map((body) => object(body?.['product']))
    .find((value) => value !== undefined);
  const model = text(product?.['name']);
  const categories = product?.['categories'];
  if (!product || !/\b(?:rifle|pistol)$/i.test(model) || /airsoft/i.test(model)
    || !Array.isArray(categories) || !categories.some((category) => object(category)?.['slug'] === 'firearms')) {
    return { ...result, skipped: ['not a complete firearm product'] };
  }
  const variants = product['variants'];
  if (!Array.isArray(variants)) return { ...result, skipped: ['no configuration specifications'] };
  for (const value of variants) {
    const variant = object(value);
    const sku = text(variant?.['sku']);
    const rows = variant?.['specs'];
    const specs = new Map<string, string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const item = object(row);
      specs.set(text(item?.['label']).toLowerCase(), text(item?.['value']));
    }
    const cartridge = specs.get('caliber') ?? '';
    const barrelLength = specs.get('barrel length') ?? '';
    const length = inches(barrelLength);
    if (!sku || !loadableCartridge(cartridge) || length === undefined) {
      result.skipped.push(`${sku || 'unnamed configuration'}: missing cartridge/barrel unit or not loadable`);
      continue;
    }
    const weight = specs.get('weight') ?? '';
    const gunMass = mass(weight);
    const twist = specs.get('barrel twist') ?? '';
    const twistLength = inches(twist.replace(/^1\s*(?:in\b|:|-)\s*/i, ''));
    const name = `Desert Tech ${model} ${cartridge} ${barrelLength} (${sku})`;
    result.firearms.push({
      format: FIREARM_FORMAT, schemaVersion: FIREARM_SCHEMA_VERSION,
      name, maker: 'Desert Tech', model, cartridge,
      barrel: { name, length, gasLeaks: [],
        ...(gunMass === undefined ? {} : { gunMass }),
        ...(twistLength === undefined ? {} : { twistLength }),
      },
      source: {
        kind: 'published', publisher: 'Desert Tech', url, retrieved,
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' }),
        published: publishedFigures({ partNumber: sku, caliber: cartridge, barrelLength, weight, twist }),
      },
    });
  }
  return result;
}

async function main(): Promise<void> {
  const args = crawlArguments('desert-tech', process.argv.slice(2));
  if (!args) return;
  // After the operator's robots.txt survey, visit only public product URLs from the sitemap,
  // never API URLs embedded in a page.
  const pages = productPages(await fetchText(`${SITE}/sitemap.xml`)).slice(0, args.limit);
  mkdirSync(args.folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  const names = new Set<string>();
  let written = 0;
  for (const url of pages) {
    await sleep(DELAY);
    // Stop on a refusal instead of retrying a different route to the same material.
    const parsed = firearmsFrom(await fetchText(url), url, retrieved);
    for (const reason of parsed.skipped) console.log(`Skipped ${url}: ${reason}`);
    for (const firearm of parsed.firearms) {
      const json = firearmJson(firearm);
      if ('problem' in json) throw new Error(`${firearm.name}: ${json.problem}`);
      const file = fileName(firearm);
      if (names.has(file)) throw new Error(`Duplicate firearm: ${firearm.name}`);
      names.add(file);
      writeFileSync(join(args.folder, file), json.text);
      console.log(summaryLine(firearm));
      written++;
    }
  }
  console.log(`${written} guns written from ${pages.length} pages to ${args.folder}`);
}

if (import.meta.main) await main();
