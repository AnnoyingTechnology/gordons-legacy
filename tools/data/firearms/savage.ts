/**
 * Reads Savage Arms' published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/savage.ts <output folder> [--limit 5]
 *
 * Two kinds of page carry the figures. A model page (`/firearms/model/110-apex-hunter-xp`) lists its
 * SKUs in rows with the cartridge and the barrel length; a SKU page (`/firearms/sku/46000`) has the
 * full property table with the twist and the weight. The sitemap lists both, with nearly 4000 SKUs, most
 * of them a colour or a market of another. So the model pages are walked, and one SKU is fetched for each
 * model, cartridge and barrel length found there: that SKU's figures stand for the others.
 *
 * Only the cartridge, the barrel length, the twist and the mass are taken.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, DELAY, fetchText, fileName, firearmJson, sleep, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://savagearms.com/site-map';

/** A row of a model page's list of SKUs. */
export interface SkuRow {
  /** The SKU number, which is the end of the SKU page's address. */
  sku: string;
  /** The cartridge as the page words it, for example `223 Rem`. */
  cartridge: string;
  /** The barrel length as the page words it, for example `20" (50.8 cm)`. */
  barrelLength: string;
}

function decode(text: string): string {
  return text.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#039;', "'").replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim();
}

/** The first part of a page's title, which is the model: `110 Apex Hunter XP Rifle Package | Savage Arms`, without the trailing word that says how it is sold. */
export function modelFromTitle(page: string): string | undefined {
  const title = /<title>([^<|]*)/.exec(page)?.[1];
  return title === undefined ? undefined : decode(title).replace(/\s+(Rifle\s+)?Package$|\s+Rifle$/i, '');
}

/** The SKUs a model page lists, once each (the page lists them for a narrow and a wide screen). */
export function skuRows(page: string): SkuRow[] {
  const rows = new Map<string, SkuRow>();
  const blocks = page.split(/window\.location\.href='\/firearms\/sku\//).slice(1);
  for (const block of blocks) {
    const sku = /^(\d+)/.exec(block)?.[1];
    const cartridge = /CALIBER:\s*([^<]*)</.exec(block)?.[1];
    const barrelLength = /BARREL LENGTH:\s*([^<]*)</.exec(block)?.[1];
    if (sku === undefined || cartridge === undefined || barrelLength === undefined || rows.has(sku)) continue;
    rows.set(sku, { sku, cartridge: decode(cartridge), barrelLength: decode(barrelLength) });
  }
  return [...rows.values()];
}

/** The property table of a SKU page, as name → value. */
export function properties(page: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const [, name, value] of page.matchAll(/<td[^>]*scope="row"[^>]*>\s*([^<]*?)\s*<\/td>\s*<td[^>]*>\s*([^<]*?)\s*<\/td>/g)) {
    if (!table.has(decode(name!))) table.set(decode(name!), decode(value!));
  }
  return table;
}

/**
 * A length in metres from `20" (50.8 cm)`: the metric figure when the page gives it, else the inches.
 * Nothing when it is neither.
 */
export function length(text: string | undefined): number | undefined {
  const centimetres = /\(([0-9]+(?:\.[0-9]+)?)\s*cm\)/.exec(text ?? '');
  if (centimetres) return Number(centimetres[1]) * 10 * units.MILLIMETRE;
  const inches = /^\s*([0-9]+(?:\.[0-9]+)?)\s*"/.exec(text ?? '');
  return inches ? Number(inches[1]) * units.INCH : undefined;
}

/** A mass in kilograms from `6.1 lbs (2.77 kg)`: the metric figure, else the pounds. */
export function mass(text: string | undefined): number | undefined {
  const kilograms = /\(([0-9]+(?:\.[0-9]+)?)\s*kg\)/.exec(text ?? '');
  if (kilograms) return Number(kilograms[1]);
  const pounds = /^\s*([0-9]+(?:\.[0-9]+)?)\s*lbs?\b/.exec(text ?? '');
  return pounds ? Number(pounds[1]) * units.POUND : undefined;
}

/** The twist in metres per turn from `1:16"`: inches per turn. Nothing without the inch mark. */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^\s*1\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*"/.exec(text ?? '');
  return match && Number(match[1]) > 0 ? Number(match[1]) * units.INCH : undefined;
}

/** A cartridge a reloader loads for: no rimfire, no shotgun gauge. */
export function loadable(cartridge: string): boolean {
  return /[0-9]/.test(cartridge) && !/\b(22|17)\s*(lr|long rifle|wmr|hmr|wsm|short)\b/i.test(cartridge) && !/gauge|\b[0-9]+\s*ga\b|\.?410\b/i.test(cartridge);
}

/** The gun a SKU page describes, or nothing when it has no loadable cartridge or no barrel length. */
export function firearmFrom(page: string, model: string, url: string, retrieved: string): Firearm | undefined {
  const table = properties(page);
  const cartridge = table.get('Caliber');
  const barrelLength = length(table.get('Barrel Length'));
  const type = table.get('Firearm Type')?.toLowerCase();
  if (!cartridge || !loadable(cartridge) || barrelLength === undefined || (type !== 'centerfire' && type !== 'handgun')) return undefined;
  const twistText = table.get('Rate of Twist');
  const weight = table.get('Weight');
  const twist = twistLength(twistText);
  const gunMass = mass(weight);
  const name = `Savage ${model.replace(/^Savage\s+/i, '')} ${cartridge} ${Math.round(barrelLength * 1000)} mm`;
  // Savage sells its package models with a scope fitted and does not say whether the weight includes
  // it, so the gun carries the warning rather than letting a scoped weight pass as the gun's own mass.
  const soldWithOptic = /\bpackage\b|\bxp\b|\bcombo\b/i.test(model);
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    maker: 'Savage Arms',
    model,
    cartridge,
    ...(soldWithOptic && gunMass !== undefined
      ? { notes: 'Savage sells this model with a scope fitted, and its published weight may include the optic. Weigh the gun.' }
      : {}),
    barrel: {
      name,
      length: barrelLength,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Savage Arms',
      url,
      retrieved,
      // One Weight per SKU, with nothing said about what it covers.
      ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
      published: publishedFigures({ barrelLength: table.get('Barrel Length'), weight, twist: twistText }),
    },
  };
}

async function main(): Promise<void> {
  const args = crawlArguments('savage', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const models = [...new Set(sitemap.match(/https:\/\/savagearms\.com\/firearms\/model\/[a-z0-9-]+/g) ?? [])].slice(0, limit);
  console.log(`${models.length} model pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const names = new Set<string>();
  for (const modelUrl of models) {
    await sleep(DELAY);
    let modelPage: string;
    try {
      modelPage = await fetchText(modelUrl);
    } catch (error) {
      skipped.push(`${modelUrl}: ${(error as Error).message}`);
      continue;
    }
    const model = modelFromTitle(modelPage) ?? modelUrl;
    // One SKU per cartridge and barrel length: the others differ by colour or market.
    const chosen = new Map<string, SkuRow>();
    for (const row of skuRows(modelPage)) {
      if (loadable(row.cartridge) && !chosen.has(`${row.cartridge}|${row.barrelLength}`)) chosen.set(`${row.cartridge}|${row.barrelLength}`, row);
    }
    for (const row of chosen.values()) {
      await sleep(DELAY);
      const url = `https://savagearms.com/firearms/sku/${row.sku}`;
      let page: string;
      try {
        page = await fetchText(url);
      } catch (error) {
        skipped.push(`${url}: ${(error as Error).message}`);
        continue;
      }
      const firearm = firearmFrom(page, model, url, retrieved);
      if (!firearm) {
        skipped.push(`${url}: ${model} ${row.cartridge}: not a centerfire gun with a barrel length`);
        continue;
      }
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${json.problem}`);
        continue;
      }
      const file = fileName(firearm);
      if (names.has(file)) continue; // two models list the same gun
      names.add(file);
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
