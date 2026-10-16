/**
 * Reads Tanfoglio's published pistol specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/tanfoglio.ts <output folder> [--limit 5]
 *
 * tanfoglio.it has no sitemap. Its home page links every model as `/it_IT/prodotti/<CODE>/<slug>`, and
 * those links are the page list. A model page (in Italian) has:
 *
 * - a "CARATTERISTICHE TECNICHE" table whose rows alternate: a row of bold labels (`Lunghezza totale`,
 *   `Lunghezza canna`, `Peso`, ...) and the row of values under them (`112mm`, `1125gr.`). The numbers
 *   are metric, often with a comma decimal (`152,5mm`), and `gr.` is grams.
 * - a "CALIBRI" list of variants, `COMBAT F CAL. 9X19 BLACK`, one link per chambering and finish.
 *
 * The page holds one barrel length and one weight for the whole list, so every chambering of the model
 * carries the page's figures. Where the weight is given per chambering (`1090 gr. (CAL.45ACP) - 1120 gr.
 * (CAL.9mm)`), only a chambering the annotation names takes a weight; the others get none.
 *
 * Left out: rimfire, and any variant whose name carries a word this reader does not know (`K`, `GK`,
 * `BULLSEYE`, `BDS VERSION`), since those may be a different barrel the page's figures do not describe;
 * a variant that names another model than the page's; a model whose page lists no chamberings. The
 * weight does not say what it includes, so the mass basis is `unstated`. Tanfoglio publishes no twist.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, fetchPage, fetchText, fileName, firearmJson, plainText, plausibleGunMass, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITE = 'https://tanfoglio.it';

/** The links of the home page that lead to a model. */
export function modelLinks(homePage: string): string[] {
  const links = [...homePage.matchAll(/href="(\/it_IT\/prodotti\/[A-Z0-9]+\/[a-z0-9-]+)"/g)].map(([, path]) => path!);
  return [...new Set(links)];
}

/** The model's name from `<h1 id="name">`, as the page writes it (capitals). */
export function titleOf(page: string): string | undefined {
  const title = /<h1[^>]*id="name"[^>]*>(.*?)<\/h1>/s.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title) || undefined;
}

/**
 * The values of the "CARATTERISTICHE TECNICHE" table by label. The table's rows alternate between a row
 * of bold labels and the row of values under them.
 */
export function specifications(page: string): Map<string, string> {
  const values = new Map<string, string>();
  const start = page.indexOf('CARATTERISTICHE TECNICHE');
  const table = /<table[^>]*>(.*?)<\/table>/s.exec(page.slice(start < 0 ? 0 : start))?.[1] ?? '';
  const rows = [...table.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row]) => ({
    labels: /<strong/.test(row!),
    cells: [...row!.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(([, cell]) => plainText(cell!)),
  }));
  rows.forEach((row, index) => {
    const below = rows[index + 1];
    if (!row.labels || below === undefined || below.labels) return;
    row.cells.forEach((label, column) => {
      if (below.cells[column] !== undefined && !values.has(label.toLowerCase())) values.set(label.toLowerCase(), below.cells[column]!);
    });
  });
  return values;
}

/** A length in metres from `112mm` or `152,5mm`; anything else is nothing. */
export function length(text: string | undefined): number | undefined {
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*mm$/i.exec(text ?? '');
  return match ? Number(match[1]!.replace(',', '.')) * units.MILLIMETRE : undefined;
}

/** The weights a `Peso` cell gives: one for the model, or one per chambering when annotated. */
export interface Weights {
  /** The grams printed for the model as a whole (`1125`), when the cell has a single unannotated figure. */
  whole?: string;
  /** The grams printed for a named chambering: `1090 gr. (CAL.45ACP)` is `{ '45ACP': '1090' }`. */
  perCartridge: Map<string, string>;
}

/** `1125gr.`, `1343 gr.` or `1090 gr. (CAL.45ACP) - 1120 gr. (CAL.9mm)`. */
export function weights(text: string | undefined): Weights {
  const result: Weights = { perCartridge: new Map() };
  const figures = [...(text ?? '').matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*gr\.?\s*(?:\(([^)]*)\))?/gi)];
  for (const [, printed, annotation] of figures) {
    if (annotation === undefined) {
      if (figures.length === 1) result.whole = printed!.trim();
    } else {
      result.perCartridge.set(annotation.replace(/cal\.*|[\s.]/gi, '').toUpperCase(), printed!.trim());
    }
  }
  return result;
}

/** A mass in kilograms from the grams a `Peso` cell printed (`1125`; the unit is `gr.`, grams). */
export function mass(printed: string | undefined): number | undefined {
  const match = /^([0-9]+(?:[.,][0-9]+)?)$/.exec(printed ?? '');
  return plausibleGunMass(match ? Number(match[1]!.replace(',', '.')) * units.GRAM : undefined);
}

/**
 * The chamberings the pages write, to the conventional name of the cartridge, and the key a per-chambering
 * weight annotation uses. One entry per form, since a cartridge not in this table is a skipped variant.
 * `.38 SA` is the .38 Super Auto of Tanfoglio's practical-shooting guns.
 */
const CARTRIDGES: { pattern: RegExp; name: string; annotation: string }[] = [
  { pattern: /^10\s*MM\s*AUTO\b/i, name: '10mm Auto', annotation: '10MM' },
  { pattern: /^9\s*X\s*19\b/i, name: '9x19 mm', annotation: '9MM' },
  { pattern: /^9\s*X\s*21\b/i, name: '9x21 mm', annotation: '9X21' },
  { pattern: /^\.*\s*38\s*SA\b/i, name: '.38 Super', annotation: '38SA' },
  { pattern: /^\.*\s*40\s*S&W\b/i, name: '.40 S&W', annotation: '40S&W' },
  { pattern: /^\.*\s*45\s*ACP\b/i, name: '.45 Auto', annotation: '45ACP' },
];

/** Words that may follow the cartridge in a variant's name without changing the barrel: finishes, a year, a sight. */
const HARMLESS_WORDS = /^(BLACK|SILVER|BRONZE|GREEN|CHR|CROMATA|DUOTONE|COMBO|OPTIC|READY|FIXED|SIGHT|[0-9]{4})$/i;

/** A variant of the CALIBRI list, split into the model it names and the chambering it is for. */
export interface Variant {
  /** The label as printed: `COMBAT F CAL. 9X19 BLACK`. */
  printed: string;
  model: string;
  cartridge: string;
  annotation: string;
}

/** The variants of a page that name a known chambering and nothing else of consequence. */
export function variants(page: string): { variants: Variant[]; unknown: string[] } {
  const found: Variant[] = [];
  const unknown: string[] = [];
  for (const [, label] of page.matchAll(/class="varianteArma"[^>]*>(.*?)<\/a>/gs)) {
    const printed = plainText(label!);
    const split = /^(.*?)\s+CAL\.*\s*(.*)$/i.exec(printed);
    const cartridge = split && CARTRIDGES.find(({ pattern }) => pattern.test(split[2]!));
    if (!split || !cartridge) {
      unknown.push(printed);
      continue;
    }
    const rest = split[2]!.replace(cartridge.pattern, '').trim().split(/\s+/).filter((word) => word !== '');
    if (!rest.every((word) => HARMLESS_WORDS.test(word))) {
      unknown.push(printed);
      continue;
    }
    found.push({ printed, model: split[1]!, cartridge: cartridge.name, annotation: cartridge.annotation });
  }
  return { variants: found, unknown };
}

/** Title case, keeping the roman numerals and the short codes as they are: `STOCK III P` is `Stock III P`. */
export function titleCase(title: string): string {
  return title
    .split(' ')
    .map((word) => (/^(FT|I|II|III|P|F|R|L|LR|MK[0-9]*)$/.test(word) || /[0-9]/.test(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(' ');
}

/** The guns of one model page: one per distinct chambering. */
export function firearmsFrom(page: string, url: string, retrieved: string): Firearm[] {
  const title = titleOf(page);
  const table = specifications(page);
  const barrelText = table.get('lunghezza canna');
  const barrel = length(barrelText);
  if (title === undefined || barrel === undefined) return [];
  const weight = weights(table.get('peso'));
  const model = titleCase(title);
  const guns = new Map<string, Firearm>();
  for (const variant of variants(page).variants) {
    if (variant.model.toUpperCase() !== title.toUpperCase() || guns.has(variant.cartridge)) continue;
    const printedWeight = weight.whole ?? weight.perCartridge.get(variant.annotation);
    const gunMass = mass(printedWeight);
    const name = `Tanfoglio ${model} ${variant.cartridge}`;
    guns.set(variant.cartridge, {
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker: 'Tanfoglio',
      model,
      cartridge: variant.cartridge,
      barrel: {
        name,
        length: barrel,
        ...(gunMass === undefined ? {} : { gunMass }),
        gasLeaks: [],
      },
      source: {
        kind: 'published',
        publisher: 'Tanfoglio',
        url,
        retrieved,
        // `Peso` does not say what it includes.
        ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
        // The weight kept is the figure for this chambering, not the whole cell with its other figures;
        // the page's `gr.` is written `g` so that the corpus checker, which knows `kg` and `g`, can read it.
        published: publishedFigures({
          caliber: variant.printed,
          barrelLength: barrelText,
          weight: printedWeight === undefined ? undefined : `${printedWeight} g`,
        }),
      },
    });
  }
  return [...guns.values()];
}

async function main(): Promise<void> {
  const args = crawlArguments('tanfoglio', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const home = await fetchText(`${SITE}/`);
  const pages = modelLinks(home).slice(0, limit);
  console.log(`${pages.length} model pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const taken = new Map<string, Firearm>();
  for (const path of pages) {
    const url = `${SITE}${path}`;
    let page: string;
    try {
      page = await fetchPage(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    const firearms = firearmsFrom(page, url, retrieved);
    if (firearms.length === 0) skipped.push(`${url}: no chambering with a known cartridge name`);
    const left = variants(page).unknown;
    if (left.length > 0) skipped.push(`${url}: ${left.length} variants left out, such as "${left[0]}"`);
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
