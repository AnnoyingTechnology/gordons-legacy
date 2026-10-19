/**
 * Reads Sabatti's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/sabatti.ts <output folder> [--limit 5]
 *
 * www.sabatti.it lists its models in `sitemap.xml` as `/prodotto/<slug>`; the pages themselves live under
 * `/it/prodotto/<slug>` and are read in Italian. A page has a "Specifiche" list of paragraphs, each a
 * label and a bold value (`Lunghezza canna: 61 cm / 24"`, `Peso: 4,6 kg / 10.14 lbs`), and a "Calibri"
 * list of cartridges separated by line breaks. Each measure is printed in metric and imperial, rounded
 * differently, so the figure printed to the finer step is kept (the rule of Ruger's reader).
 *
 * The page holds one weight and one barrel length for the whole list of cartridges, so a page counts
 * only when it gives a single barrel length and a single weight; the cartridges then share them. Left out:
 *
 * - a page with several barrel lengths (`51-56-61 cm`) or a weight range (`2,8-3,3 kg (min-max famiglia)`),
 *   since the figures belong to no one barrel;
 * - shotguns (a gauge in the caliber list), rimfire, and cartridges annotated with anything but a twist
 *   (`(no MRR)`), since the annotation says the figures differ for that one;
 * - any measure whose metric and imperial renderings disagree by more than their rounding allows.
 *
 * The weight does not say what it includes, so the mass basis is `unstated`. The twist exists only where
 * a cartridge is annotated `(passo 9”)` (the pitch in inches).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadableCartridge } from './loadable-cartridge.ts';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, fetchPage, fetchText, fileName, firearmJson, plainText, plausibleGunMass, summaryLine } from './maker-site.ts';
import { finest, type Reading } from './finest-reading.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.sabatti.it/sitemap.xml';

/** The product pages of the sitemap, as the Italian pages the server really answers with. */
export function productPages(sitemap: string): string[] {
  const slugs = [...sitemap.matchAll(/<loc>https:\/\/www\.sabatti\.it\/prodotto\/([^<]+)<\/loc>/g)].map(([, slug]) => slug!);
  return slugs.map((slug) => `https://www.sabatti.it/it/prodotto/${slug}`);
}

/** The labelled values of the "Specifiche" list, label (no colon) to value, first one wins. */
export function labelledValues(page: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const [, label, value] of page.matchAll(/<p class="mb-1 text-muted">\s*([^<]*?)\s*<span[^>]*>(.*?)<\/span>\s*<\/p>/gs)) {
    const key = plainText(label!).replace(/:\s*$/, '');
    if (!values.has(key)) values.set(key, plainText(value!));
  }
  return values;
}

/** A cartridge of the "Calibri" list, with the twist its annotation gives when it has one. */
export interface Chambering {
  /** As printed, annotation included: `.223 Remington (passo 9”)`. */
  printed: string;
  cartridge: string;
  /** Metres per turn, from `(passo 9”)`. */
  twist?: number;
}

/** The cartridges of the "Calibri" section: the lines between that heading and the next one. */
export function chamberings(page: string): { chamberings: Chambering[]; left: string[] } {
  const section = /<h4>\s*<strong>Calibri<\/strong>\s*<\/h4>(.*?)(?:<h4|$)/s.exec(page)?.[1] ?? '';
  const lines = section
    .split(/<br\s*\/?>|<\/p>|<p>|<\/li>|<li>/i)
    .map((line) => plainText(line))
    .filter((line) => line !== '');
  // Some pages do not close the list with a heading; its end is the next section's title.
  const end = lines.findIndex((line) => /^(Caratteristiche|Opzioni|Dotazioni)\b/i.test(line));
  if (end >= 0) lines.length = end;
  const found: Chambering[] = [];
  const left: string[] = [];
  for (const printed of lines) {
    const note = /^([^(]+?)\s*(?:\(([^)]*)\))?$/.exec(printed);
    const cartridge = note?.[1]?.trim();
    const annotation = note?.[2];
    if (!cartridge || cartridge.length > 40 || !loadableCartridge(cartridge)) {
      left.push(printed);
      continue;
    }
    if (annotation === undefined) {
      found.push({ printed, cartridge });
      continue;
    }
    const pitch = /^passo\s+([0-9]+(?:[.,][0-9]+)?)\s*(?:"|in\b)$/i.exec(annotation);
    if (pitch) found.push({ printed, cartridge, twist: Number(pitch[1]!.replace(',', '.')) * units.INCH });
    else left.push(printed);
  }
  return { chamberings: found, left };
}


function reading(printed: string, unit: number, step: number | undefined): Reading {
  const decimals = printed.split(/[.,]/)[1]?.length ?? 0;
  return { value: Number(printed.replace(',', '.')) * unit, step: (step ?? 1) * 10 ** -decimals * unit };
}

/** Whether two renderings of one measure are the same figure, to a tolerance as a fraction. */
export function agree(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance * Math.max(a, b);
}

/**
 * A barrel length from `61 cm / 24"` or `60 cm`: the metric and the imperial rendering when both are
 * printed, the finer step kept. A list (`51-56-61 cm`, `12" / 14" / 18"`) is nothing.
 */
export function barrelLength(text: string | undefined): number | undefined {
  const centimetres = /^([0-9]+(?:[.,][0-9]+)?)\s*cm(?:\s*\/\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:"|in\b))?$/.exec(text ?? '');
  if (centimetres) {
    const metric = reading(centimetres[1]!, 10 * units.MILLIMETRE, undefined);
    if (centimetres[2] === undefined) return metric.value;
    const imperial = reading(centimetres[2], units.INCH, undefined);
    if (!agree(metric.value, imperial.value, 0.03)) return undefined;
    return finest([metric, imperial])!.value;
  }
  const inches = /^([0-9]+(?:[.,][0-9]+)?)\s*(?:"|in\b)$/.exec(text ?? '');
  return inches ? reading(inches[1]!, units.INCH, undefined).value : undefined;
}

/**
 * A mass from `4,6 kg / 10.14 lbs` or `3 kg`, the finer step kept. A range (`2,8-3,3 kg`) is nothing,
 * and so is a pair whose renderings disagree by more than 5 %.
 */
export function mass(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*kg(?:\s*\/\s*([0-9]+(?:[.,][0-9]+)?)\s*lbs?\.?)?$/i.exec(text ?? '');
  if (!match) return undefined;
  const metric = reading(match[1]!, 1, undefined);
  if (match[2] === undefined) return plausibleGunMass(metric.value);
  const imperial = reading(match[2], units.POUND, undefined);
  if (!agree(metric.value, imperial.value, 0.05)) return undefined;
  return plausibleGunMass(finest([metric, imperial])!.value);
}

/** The model from the specification list, else from the page's title. */
function modelOf(page: string, values: Map<string, string>): string | undefined {
  const model = values.get('Modello');
  if (model) return model;
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title).replace(/\s*\(.*$/, '') || undefined;
}

/** The guns of one page: one per cartridge of its list. */
export function firearmsFrom(page: string, url: string, retrieved: string): Firearm[] {
  const values = labelledValues(page);
  const model = modelOf(page, values);
  const barrelText = values.get('Lunghezza canna');
  const weightText = values.get('Peso');
  const barrel = barrelLength(barrelText);
  if (model === undefined || barrel === undefined) return [];
  const gunMass = mass(weightText);
  const guns = new Map<string, Firearm>();
  for (const chambering of chamberings(page).chamberings) {
    const name = `Sabatti ${model} ${chambering.cartridge}`;
    if (guns.has(name)) continue;
    guns.set(name, {
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Sabatti',
      model,
      cartridge: chambering.cartridge,
      barrel: {
        name,
        length: barrel,
        ...(chambering.twist === undefined ? {} : { twistLength: chambering.twist }),
        ...(gunMass === undefined ? {} : { gunMass }),
        gasLeaks: [],
      },
      source: {
        kind: 'published',
        publisher: 'Sabatti',
        url,
        retrieved,
        // `Peso` does not say what it includes.
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
        published: publishedFigures({
          caliber: chambering.printed,
          barrelLength: barrelText,
          weight: gunMass === undefined ? undefined : weightText,
          twist: chambering.twist === undefined ? undefined : `1:${/passo\s+([0-9.,]+)/.exec(chambering.printed)![1]}"`,
        }),
      },
    });
  }
  return [...guns.values()];
}

async function main(): Promise<void> {
  const args = crawlArguments('sabatti', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = productPages(await fetchText(SITEMAP)).slice(0, limit);
  console.log(`${pages.length} product pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const taken = new Map<string, Firearm>();
  for (const url of pages) {
    let page: string;
    try {
      page = await fetchPage(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const firearms = firearmsFrom(page, url, retrieved);
    if (firearms.length === 0) {
      const values = labelledValues(page);
      skipped.push(`${url}: no single barrel length (barrel "${values.get('Lunghezza canna') ?? 'none'}", weight "${values.get('Peso') ?? 'none'}") with a cartridge`);
    }
    const { left } = chamberings(page);
    if (firearms.length > 0 && left.length > 0) skipped.push(`${url}: calibers left out: ${left.join('; ')}`);
    for (const firearm of firearms) {
      const file = fileName(firearm);
      const earlier = taken.get(file);
      if (earlier !== undefined) {
        skipped.push(`${url}: ${firearm.name} is already written (${earlier.source?.url}); barrel ${earlier.barrel.length} m against ${firearm.barrel.length} m`);
        continue;
      }
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${json.problem}`);
        continue;
      }
      taken.set(file, firearm);
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
