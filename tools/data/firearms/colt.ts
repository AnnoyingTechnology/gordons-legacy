/**
 * Reads Colt's published firearm specifications into gun files (issue #30). Maintainer tool, written
 * like glock.ts.
 *
 *     deno run -A tools/data/firearms/colt.ts <output folder> [--limit 5]
 *
 * Pages read: the `/detail-page/` product pages of `colt.com/product-sitemap1.xml` (about 40, a second
 * apart). A page is a WooCommerce product, and the figures reach it in one of two ways:
 *
 *  - A page that sells several variants (the rifles and submachine guns, a revolver in two barrel
 *    lengths) carries them in the `data-product_variations` attribute of its form: one JSON entry per
 *    variant, whose `variation_fields` is a list of `iconic-cffv-field` blocks keyed `caliber`,
 *    `barrel_length`, `weight` and `rifling`. Each variant is one gun, read from its own entry and named
 *    by its own option (`M4 Carbine (16.1") Semi Auto`). Figures are never carried from one variant to
 *    another, and the keyed field is the only place a barrel length is read from: a `Handguard` field
 *    on the same variant prints a length too (`10.35"`) that is not the barrel's.
 *  - A page that sells one gun lists `Caliber : 45 ACP` and `Barrel Length : 4.25"` in its text.
 *
 * Lengths are printed in inches with the metric figure beside them (`16.1” (408.9 mm)`), and the finer
 * step wins. The pages set the inch mark as a typographic quote; `source.published` keeps the figure as
 * printed with that one character written `"`, which is the same mark in the spelling every other
 * maker's pages use. Weights are printed in pounds with kilograms beside them; the page gives one weight and
 * does not say what it includes, so the mass basis is `unstated`.
 *
 * Left out, and counted in the skip list:
 *  - most pistol pages print a caliber and a capacity but no barrel length (it is hidden by the site's
 *    own stylesheet on several models), and no weight at all: without a barrel length there is no gun;
 *  - a revolver or pistol that prints a barrel length has no weight in the record: Colt does not
 *    publish one for them;
 *  - the WooCommerce `weight` of a variation is a shipping weight and is never read;
 *  - accessories (optics plates), rimfire (.22 LR King Cobra) and anything without a loadable cartridge.
 */
import { decodeEntities, fetchText, plainText, textLines } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import {
  crawl,
  firearmRecord,
  labelled,
  length,
  mass,
  readableName,
  twist,
  type PageReading,
  withMaker,
} from './printed-figures.ts';

const SITEMAP = 'https://www.colt.com/product-sitemap1.xml';

/** The figures of one variant, keyed as the site keys them: `caliber`, `barrel_length`, `weight`, `rifling`. */
export function variationFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const block of html.split('data-field-id="').slice(1)) {
    const key = /^iconic_cffv_[0-9]+_([a-z_]+)"/.exec(block)?.[1];
    if (key === undefined) continue;
    const label = /<strong[^>]*>([\s\S]*?)<\/strong>/.exec(block)?.[1];
    let text = plainText(block.replace(/^[^>]*>/, '').replace(/<div class="iconic-cffv-field"\s*$/, ''));
    if (label !== undefined) text = text.replace(plainText(label), '').replace(/^\s*:\s*/, '').trim();
    if (!fields.has(key) && text !== '') fields.set(key, text);
  }
  return fields;
}

/** One variant of a product: its option name, when it has one, and its fields. */
interface Variant {
  option: string | undefined;
  fields: Map<string, string>;
}

/** The variants a page's form carries; empty when the page sells one gun. */
export function variants(page: string): Variant[] {
  const attribute = /data-product_variations="([^"]*)"/.exec(page)?.[1];
  if (attribute === undefined) return [];
  let entries: Array<{ attributes?: Record<string, string>; variation_fields?: string }>;
  try {
    entries = JSON.parse(decodeEntities(attribute));
  } catch {
    return [];
  }
  // The option labels: `<option value="m4-carbine-16-1-semi-auto">M4 Carbine (16.1”) Semi Auto</option>`.
  const labels = new Map([...page.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map(([, value, text]) => [value!, plainText(text!)] as const));
  return entries.map((entry) => ({
    option: labels.get(entry.attributes?.['attribute_pa_variant'] ?? ''),
    fields: variationFields(entry.variation_fields ?? ''),
  }));
}

/** The product's name from the page title: `Gold Cup Trophy - Colt’s Manufacturing Company LLC`. */
export function productName(page: string): string | undefined {
  const title = /<title>([^<]*)<\/title>/i.exec(page)?.[1];
  const name = title === undefined ? '' : plainText(title).replace(/\s+-\s+Colt's Manufacturing Company LLC$/i, '').trim();
  return name === '' ? undefined : name;
}

/** The gun one variant (or one single-gun page) describes. */
function gunFrom(name: string, fields: Map<string, string>, url: string, retrieved: string): PageReading {
  const caliber = fields.get('caliber');
  const barrelText = fields.get('barrel_length');
  const weightText = fields.get('weight');
  const rifling = fields.get('rifling');
  if (caliber === undefined || !loadableCartridge(caliber)) return { skipped: `${name}: no loadable cartridge (${caliber ?? 'none printed'})` };
  const barrelLength = barrelText === undefined ? undefined : length(barrelText);
  if (barrelLength === undefined) return { skipped: `${name}: no barrel length printed` };
  const gunMass = weightText === undefined ? undefined : mass(weightText);
  const readable = readableName(name);
  return {
    firearm: firearmRecord({
      maker: 'Colt',
      publisher: "Colt's Manufacturing Company LLC",
      name: withMaker('Colt', readable),
      model: readable.replace(/^Colt\s+/i, ''),
      cartridge: caliber,
      barrelLength,
      twistLength: rifling === undefined ? undefined : twist(rifling),
      gunMass,
      massBasis: 'unstated',
      url,
      retrieved,
      published: { caliber, barrelLength: barrelText, weight: weightText, twist: rifling },
    }),
  };
}

/** The guns a page describes, or the reasons it gives none. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const name = productName(page);
  if (name === undefined) return [{ skipped: 'no title' }];
  const sold = variants(page);
  if (sold.length > 0) {
    return sold.map((variant) => gunFrom(sold.length === 1 ? name : (variant.option ?? name), variant.fields, url, retrieved));
  }
  // One gun, its figures in the text: `Caliber : 45 ACP`.
  const lines = textLines(page).map((line) => line.replace(/\s*:\s*/, ': '));
  const fields = new Map<string, string>();
  for (const [key, label] of [['caliber', 'Caliber'], ['barrel_length', 'Barrel Length'], ['weight', 'Weight']] as const) {
    const value = labelled(lines, label);
    if (value !== undefined) fields.set(key, value);
  }
  return [gunFrom(name, fields, url, retrieved)];
}

async function main(): Promise<void> {
  const urls = [...(await fetchText(SITEMAP)).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!).filter((url) => url.includes('/detail-page/'));
  await crawl('colt', urls, readPage);
}

if (import.meta.main) await main();
