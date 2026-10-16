/**
 * Reads Sako's and Tikka's published rifle specifications into gun files (issue #30). Maintainer tool.
 *
 *     deno run -A tools/data/firearms/sako.ts <output folder> [--limit 5]
 *
 * One site, sako.global, serves both brands (tikka.fi redirects to it). Its rifle pages are Next.js
 * pages whose `__NEXT_DATA__` script holds every variant of a rifle as structured data: cartridge,
 * barrel length in millimetres, twist, and mass in kilograms. That data is part of the HTML the server
 * sends, not something added by script afterwards.
 *
 * A rifle page lists the same rifle many times over (left and right handed, finishes, markets), and the
 * mass differs by a hundred grams or so between them. Variants with the same model, cartridge, barrel
 * and twist therefore become one gun, carrying the figures of the **first** variant listed. Not the mean
 * of their masses: a record must hold a figure the maker printed, and the mean of several is a number
 * nobody published. Where the variants disagree, the record says so (`massVaries`).
 *
 * The `-b2b` pages (military and police sales) are left out. Only the cartridge, the barrel length, the
 * twist and the mass are taken.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadableCartridge } from './loadable-cartridge.ts';
import { join } from 'node:path';
import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, units, type Firearm } from '@gordons-legacy/formats';
import { crawlArguments, fetchPage, fetchText, fileName, firearmJson, plausibleGunMass, summaryLine } from './maker-site.ts';
import { publishedFigures } from './published-figures.ts';

const SITEMAP = 'https://www.sako.global/sitemap.xml';

/** One variant of a rifle, with the words its page gives for the coded fields. */
export interface RifleVariant {
  /** The submodel, for example `Sako 90 Hunter Basic`. */
  model: string;
  /** The cartridge as the page words it, for example `6,5 Creedmoor`. */
  cartridge: string;
  /** Barrel length, mm. */
  barrelLength: number;
  /** The twist as the page words it, for example `1:8"`. */
  twist?: string;
  /** Mass of the rifle, kg. */
  mass?: number;
}

/** The `__NEXT_DATA__` of a page, or nothing when it has none. */
function nextData(page: string): unknown {
  const text = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(page)?.[1];
  return text === undefined ? undefined : JSON.parse(text);
}

interface RawVariant {
  rifleCaliber?: string;
  rifleBarrelLength?: number;
  rifleRateOfTwist?: string;
  rifleProductTotalWeight?: number;
  translations?: Record<string, string>;
}

/** Every variant listed in the submodels of a rifle page. */
export function variantsOf(page: string): RifleVariant[] {
  const data = nextData(page) as { props?: { pageProps?: { page?: { content?: { submodels?: { variants?: RawVariant[] }[] } } } } } | undefined;
  const submodels = data?.props?.pageProps?.page?.content?.submodels ?? [];
  const variants: RifleVariant[] = [];
  for (const raw of submodels.flatMap((submodel) => submodel.variants ?? [])) {
    const words = raw.translations ?? {};
    const submodel = Object.entries(words).find(([key]) => key.startsWith('productSubmodel.'))?.[1];
    const model = submodel ?? Object.entries(words).find(([key]) => key.startsWith('productModel.'))?.[1];
    const cartridge = raw.rifleCaliber === undefined ? undefined : words[`rifleCaliber.${raw.rifleCaliber}`];
    const twist = raw.rifleRateOfTwist === undefined ? undefined : words[`rifleRateOfTwist.${raw.rifleRateOfTwist}`];
    if (model === undefined || cartridge === undefined || typeof raw.rifleBarrelLength !== 'number') continue;
    variants.push({
      model,
      cartridge,
      barrelLength: raw.rifleBarrelLength,
      ...(twist === undefined ? {} : { twist }),
      ...(typeof raw.rifleProductTotalWeight === 'number' ? { mass: raw.rifleProductTotalWeight } : {}),
    });
  }
  return variants;
}

/**
 * The twist in metres per turn from `1:8"` (inches) or `1:200 mm`. The inch mark or the unit is
 * required: a bare number is not guessed at.
 */
export function twistLength(text: string | undefined): number | undefined {
  const match = /^\s*1\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*("|”|in\b|mm\b)/.exec(text ?? '');
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.'));
  return number > 0 ? number * (match[2] === 'mm' ? units.MILLIMETRE : units.INCH) : undefined;
}


/** `6,5 Creedmoor` → `6.5 Creedmoor`. */
export function cartridgeName(cartridge: string): string {
  return cartridge.replace(/([0-9]),([0-9])/g, '$1.$2').trim();
}

/**
 * The model as Tikka and Sako write it. Some submodels have no translation on the page, and the page
 * then gives the code itself (`T3x_VARMINT_BASIC`); others write the generation in capitals (`T3X`).
 */
export function modelName(model: string): string {
  const words = model.replace(/_/g, ' ').trim().split(/\s+/);
  return words
    .map((word, index) => (index === 0 ? word.replace(/^(t[13])x$/i, (_, generation: string) => `${generation.toUpperCase()}x`) : /^[A-Z0-9]{2,}$/.test(word) && !/[0-9]/.test(word) ? word[0] + word.slice(1).toLowerCase() : word))
    .join(' ');
}

/** Of a group of variants, the masses the page gives, in the order it gives them, kg. */
function masses(group: readonly RifleVariant[]): number[] {
  return group.flatMap((variant) => (variant.mass === undefined ? [] : [variant.mass]));
}

/**
 * The guns of one page. Variants with the same model, cartridge, barrel and twist are one gun, with the
 * first variant's own figures. A name is the model, the cartridge and the barrel length; the twist is
 * added only where two guns of one model would otherwise share a name.
 */
export function firearmsFrom(variants: RifleVariant[], url: string, retrieved: string): Firearm[] {
  const groups = new Map<string, RifleVariant[]>();
  for (const variant of variants) {
    if (!loadableCartridge(variant.cartridge)) continue;
    const key = [modelName(variant.model), variant.cartridge, variant.barrelLength, variant.twist ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }
  const guns = [...groups.values()].map((group) => ({ first: group[0]!, group }));
  // The page's models start with the brand for the Sako 90 and 100 only (`S20`, `TRG 22/42`, `T3x`).
  const maker = /\/rifle\/t[13]x/.test(url) ? 'Tikka' : 'Sako';
  const modelOf = (gun: (typeof guns)[number]) => modelName(gun.first.model).replace(/^(sako|tikka)\s+/i, '');
  const plainName = (gun: (typeof guns)[number]) => `${maker} ${modelOf(gun)} ${cartridgeName(gun.first.cartridge)} ${gun.first.barrelLength} mm`;
  const uses = new Map<string, number>();
  for (const gun of guns) uses.set(plainName(gun), (uses.get(plainName(gun)) ?? 0) + 1);
  return guns.map((gun) => {
    const { first, group } = gun;
    const name = (uses.get(plainName(gun)) ?? 0) > 1 ? `${plainName(gun)} ${first.twist ?? ''}`.trim() : plainName(gun);
    const twist = twistLength(first.twist);
    const mass = plausibleGunMass(first.mass);
    // Finishes and handedness of one rifle are weighed differently; the record takes one of those
    // figures and says that the others exist, rather than inventing an average of them.
    const published = [...new Set(masses(group).map((value) => `${value} kg`))];
    return {
      format: FIREARM_FORMAT,
      schemaVersion: FIREARM_SCHEMA_VERSION,
      name,
      maker,
      model: modelOf(gun),
      cartridge: cartridgeName(first.cartridge),
      barrel: {
        name,
        length: first.barrelLength * units.MILLIMETRE,
        ...(twist === undefined ? {} : { twistLength: twist }),
        ...(mass === undefined ? {} : { gunMass: mass }),
        gasLeaks: [],
      },
      source: {
        kind: 'published',
        publisher: 'Sako Ltd',
        url,
        retrieved,
        // Their data calls it the product's total weight and does not say what that covers.
        ...(mass === undefined ? {} : { massBasis: 'unstated' as const }),
        published: publishedFigures({
          barrelLength: `${first.barrelLength} mm`,
          weight: published[0],
          twist: first.twist,
          ...(published.length > 1 ? { massVaries: published.join(', ') } : {}),
        }),
      },
    };
  });
}

async function main(): Promise<void> {
  const args = crawlArguments('sako', process.argv.slice(2));
  if (args === undefined) return;
  const { folder, limit } = args;
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)]
    .map(([, url]) => url!)
    .filter((url) => /\/rifle\/[a-z0-9-]+$/.test(url) && !url.endsWith('-b2b'))
    .slice(0, limit);
  console.log(`${pages.length} rifle pages`);
  mkdirSync(folder, { recursive: true });
  const retrieved = new Date().toISOString().slice(0, 10);
  let written = 0;
  const skipped: string[] = [];
  const names = new Set<string>();
  for (const url of pages) {
    let page: string;
    try {
      page = await fetchPage(url);
    } catch (error) {
      skipped.push(`${url}: ${(error as Error).message}`);
      continue;
    }
    for (const firearm of firearmsFrom(variantsOf(page), url, retrieved)) {
      const json = firearmJson(firearm);
      if ('problem' in json) {
        skipped.push(`${url}: ${json.problem}`);
        continue;
      }
      const file = fileName(firearm);
      if (names.has(file)) continue; // two pages list the same rifle
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
