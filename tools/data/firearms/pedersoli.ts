/**
 * Reads Davide Pedersoli's published specifications of its cartridge guns into gun files (issue #30).
 * Maintainer tool.
 *
 *     deno run -A tools/data/firearms/pedersoli.ts <output folder> [--limit 5]
 *
 * www.davidepedersoli.com is an October CMS site whose `/prodotto/<slug>` pages (the sitemap lists them
 * without a language prefix; the server answers in Italian) hold, for each chambering, a block of
 * labelled pairs in a "Specifiche tecniche" list: `Calibro`, `Passo in mm`, `Passo in pollici`,
 * `Lunghezza canna in mm`, `Lunghezza canna in pollici`, `Peso in Kg`, `Peso in libbre`. A page with
 * several chamberings has one block each, with its own figures. The page title is the `<h1>`.
 *
 * Each measure is printed twice, metric first and with the finer step (`813,00` mm against `32` inches,
 * `4,800` kg against `10.79` lbs), so the metric figure is read. The two are compared as a check: the
 * Kodiak Mark IV 22" page prints a barrel of `5670,00` mm beside `22` inches, and a gun whose two
 * renderings disagree is left out and reported, not guessed.
 *
 * The cells hold bare numbers and the labels hold the units, so `source.published` writes both of the
 * page's renderings with the unit of their label (`560,00 mm | 22 in`) — the page's figures, with
 * nothing of ours between them (see published-figures.ts).
 *
 * Left out: muzzle-loaders (most of the catalogue: their caliber is a bare bore such as `.45`, `.54`,
 * `12` or `17,5 mm`, never a cartridge), kits, shotgun and combination guns (a `410` in the
 * caliber), rimfire. The weight does not say what it includes, so the mass basis is `unstated`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadableCartridge, namedCartridge } from './loadable-cartridge.ts';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, fetchPage, fetchText, fileName, firearmJson, plainText, plausibleGunMass, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.davidepedersoli.com/sitemap.xml';

/** The labels of a block, in Italian, to what they are called here. */
const LABELS = {
  Calibro: 'cartridge',
  'Passo in mm': 'twistMillimetres',
  'Passo in pollici': 'twistInches',
  'Lunghezza canna in mm': 'barrelMillimetres',
  'Lunghezza canna in pollici': 'barrelInches',
  'Peso in Kg': 'weightKilograms',
  'Peso in libbre': 'weightPounds',
} as const;

/** The pages the sitemap lists as guns. */
export function productPages(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!).filter((url) => /\/prodotto\/[a-z0-9-]+$/.test(url));
}

/** One chambering of a page: its labelled values, named as above. */
export type Block = Partial<Record<(typeof LABELS)[keyof typeof LABELS], string>>;

/** The blocks of a page, one per `variants__list`. */
export function blocks(page: string): Block[] {
  return page
    .split('class="variants__list"')
    .slice(1)
    .map((chunk) => {
      const block: Block = {};
      for (const [, label, value] of chunk.matchAll(/<span class="font-weight-lighter">([^<]*)<\/span>\s*<span class="font-weight-bold">([^<]*)<\/span>/g)) {
        const key = LABELS[plainText(label!) as keyof typeof LABELS];
        if (key !== undefined && block[key] === undefined) block[key] = plainText(value!);
      }
      return block;
    })
    .filter((block) => block.cartridge !== undefined);
}

/** The page's `<h1>`, as printed (it is in capitals for most guns). */
export function titleOf(page: string): string | undefined {
  const title = /<h1[^>]*>(.*?)<\/h1>/s.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title) || undefined;
}


/** A number as the page writes it, comma or point as the decimal mark. */
function number(text: string): number {
  return Number(text.replace(',', '.'));
}

/** Inches from `32`, `4,2` or `18  1/8` (a whole number and a fraction). */
export function inches(text: string | undefined): number | undefined {
  const mixed = /^([0-9]+)\s+([0-9]+)\/([0-9]+)$/.exec((text ?? '').trim());
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  return /^[0-9]+(?:[.,][0-9]+)?$/.test((text ?? '').trim()) ? number(text!.trim()) : undefined;
}

/** A figure in a plain number string (`813,00`, `4,800`, `460`); anything else is nothing. */
export function plain(text: string | undefined): number | undefined {
  return /^[0-9]+(?:[.,][0-9]+)?$/.test((text ?? '').trim()) ? number(text!.trim()) : undefined;
}

/** How far the metric and the imperial renderings of one measure may be apart, as a fraction. */
const AGREEMENT = { length: 0.03, mass: 0.05, twist: 0.03 };

/** Whether two renderings of one measure are the same figure, to the tolerance. */
export function agree(metric: number, imperial: number, tolerance: number): boolean {
  return Math.abs(metric - imperial) <= tolerance * imperial;
}

/** A chambering that could not be read, with why. */
export interface Rejection {
  cartridge: string;
  reason: string;
}

/** The gun of one block: its figures, or the reason it was left out. */
export function firearmFromBlock(block: Block, title: string, several: boolean, url: string, retrieved: string): Firearm | Rejection {
  const cartridge = block.cartridge!;
  const barrelMetres = plain(block.barrelMillimetres) === undefined ? undefined : plain(block.barrelMillimetres)! * units.MILLIMETRE;
  const barrelInches = inches(block.barrelInches);
  if (barrelMetres === undefined) return { cartridge, reason: 'no barrel length in millimetres' };
  if (barrelInches !== undefined && !agree(barrelMetres, barrelInches * units.INCH, AGREEMENT.length)) {
    return { cartridge, reason: `barrel ${block.barrelMillimetres} mm against ${block.barrelInches} inches` };
  }
  const massKilograms = plain(block.weightKilograms);
  const massPounds = plain(block.weightPounds);
  if (massKilograms !== undefined && massPounds !== undefined && !agree(massKilograms, massPounds * units.POUND, AGREEMENT.mass)) {
    return { cartridge, reason: `weight ${block.weightKilograms} kg against ${block.weightPounds} lbs` };
  }
  const gunMass = plausibleGunMass(massKilograms);
  const twistMillimetres = plain(block.twistMillimetres);
  const twistInches = plain(block.twistInches?.replace(/^1\s*:\s*/, ''));
  if (twistMillimetres !== undefined && twistInches !== undefined && !agree(twistMillimetres * units.MILLIMETRE, twistInches * units.INCH, AGREEMENT.twist)) {
    return { cartridge, reason: `twist ${block.twistMillimetres} mm against ${block.twistInches}` };
  }
  const twist = twistMillimetres === undefined ? undefined : twistMillimetres * units.MILLIMETRE;
  const name = `Pedersoli ${title}${several ? ` ${cartridge}` : ''}`;
  return {
    format: FIREARM_FORMAT,
    schemaVersion: FIREARM_SCHEMA_VERSION,
    name,
    maker: 'Davide Pedersoli',
    model: title,
    cartridge,
    barrel: {
      name,
      length: barrelMetres,
      ...(twist === undefined ? {} : { twistLength: twist }),
      ...(gunMass === undefined ? {} : { gunMass }),
      gasLeaks: [],
    },
    source: {
      kind: 'published',
      publisher: 'Davide Pedersoli & C.',
      url,
      retrieved,
      // `Peso` does not say what it includes.
      ...(gunMass === undefined ? {} : { massBasis: 'unstated' as const }),
      published: publishedFigures({
        caliber: cartridge,
        barrelLength: block.barrelInches === undefined ? `${block.barrelMillimetres} mm` : `${block.barrelMillimetres} mm | ${block.barrelInches} in`,
        weight: block.weightKilograms === undefined ? undefined : `${block.weightKilograms} kg${block.weightPounds === undefined ? '' : ` | ${block.weightPounds} lbs`}`,
        twist: twistMillimetres === undefined ? undefined : `${block.twistMillimetres} mm${block.twistInches === undefined ? '' : ` | ${block.twistInches}`}`,
      }),
    },
  };
}

/** The guns and the rejections of one page. */
export function firearmsFrom(page: string, url: string, retrieved: string): { guns: Firearm[]; rejected: Rejection[] } {
  const title = titleOf(page);
  // A muzzle-loader's caliber is a bore (`.45`, `17,5 mm`) and names no cartridge: both tests apply here.
  const loadableBlocks = blocks(page).filter((block) => loadableCartridge(block.cartridge!) && namedCartridge(block.cartridge!));
  const guns: Firearm[] = [];
  const rejected: Rejection[] = [];
  if (title === undefined) return { guns, rejected };
  for (const block of loadableBlocks) {
    const result = firearmFromBlock(block, title, loadableBlocks.length > 1, url, retrieved);
    if ('reason' in result) rejected.push(result);
    else guns.push(result);
  }
  return { guns, rejected };
}

async function main(): Promise<void> {
  const args = crawlArguments('pedersoli', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const pages = productPages(await fetchText(SITEMAP)).slice(0, limit);
  console.log(`${pages.length} product pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  let muzzleLoaders = 0;
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
    const { guns, rejected } = firearmsFrom(page, url, retrieved);
    if (guns.length === 0 && rejected.length === 0) muzzleLoaders++;
    for (const { cartridge, reason } of rejected) skipped.push(`${url}: ${cartridge} left out, ${reason}`);
    for (const firearm of guns) {
      const file = fileName(firearm);
      const earlier = taken.get(file);
      if (earlier !== undefined) {
        skipped.push(`${url}: ${firearm.name} is already written (${earlier.source?.url}); barrel ${earlier.barrel.length} m against ${firearm.barrel.length} m, mass ${earlier.barrel.gunMass} kg against ${firearm.barrel.gunMass} kg`);
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
  console.log(`\n${written} guns written to ${folder}; ${muzzleLoaders} pages with no cartridge (muzzle-loaders, shotguns, kits)`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const reason of skipped) console.log(' -', reason);
  }
}

if (import.meta.main) await main();
