/**
 * Reads Kel-Tec's published firearm specifications into gun files (issue #30). Maintainer tool, written
 * like glock.ts.
 *
 *     deno run -A tools/data/firearms/kel-tec.ts <output folder> [--limit 5]
 *
 * Pages read: the firearm pages of `keltecweapons.com/firearm-sitemap1.xml` (about 25, a second apart);
 * the sitemap of products (`product-sitemap1.xml`, 750 holsters, magazines and parts) is not read.
 *
 * How the figures sit in a page: a block of models, each `<div class="model">` with an `<h3>` (the model
 * and its finish, `PR-3AT – Black`) and a list of `<div class="specification">` entries, a `<label>` and
 * two paragraphs: the figure in inches or ounces, then the same in millimetres or grams. The labels
 * used are `Caliber`, `Weight (Unloaded)`, `Weight (Loaded)`, `Barrel Length` and `Twist`. Each model is
 * one gun with its own figures; finishes of one model are separate records because the page lists them
 * separately, and none borrows from another.
 *
 * The two paragraphs of an entry are two strings, printed one under the other, so `source.published`
 * writes them with a `|` between them (`16.1" | 409mm`) rather than choosing one of them.
 *
 * The weight read is `Weight (Unloaded)`, the gun before its cartridges; the page does not say whether
 * the magazine is in, so the basis is `unstated`. A model with only a `Weight (Loaded)` is recorded as
 * `loaded`. The finer of the two printed steps wins (`9.66 oz` or `273.9 g`).
 *
 * Left out, and counted in the skip list: shotguns (`12 Gauge`, `.410 Bore`), rimfire (`.22 WMR`), a
 * model that names two cartridges, and a model without a barrel length. The integrally suppressed SUB
 * CQB goes with them: its page prints `Barrel Length OAL 16.2", Rifled 4.25"`, a barrel and a suppressor
 * as one unit, and neither figure is the barrel the engine means.
 *
 * Their metric column contradicts their inches on the twist — `1:7 | 1:356 mm` is one turn in 7" and
 * one in 14" — so those twists are left out of the records and the page's words kept beside them.
 */
import { fetchText, plainText } from './maker-site.ts';
import { loadableCartridge } from './loadable-cartridge.ts';
import { crawl, firearmRecord, length, mass, twist, withMaker, type PageReading } from './printed-figures.ts';

const SITEMAP = 'https://www.keltecweapons.com/firearm-sitemap1.xml';

/** One entry of a model's list: the label, and the figure in both unit systems as the page prints it. */
export interface Specification {
  label: string;
  /** The figure in inches or ounces, or a cartridge's name: `9.66 oz`. */
  standard: string;
  /** The same in millimetres or grams, when the page prints it: `273.9 g`. */
  metric: string;
}

/** A model of a page: its heading and its specification entries. */
export interface Model {
  heading: string;
  specifications: Specification[];
}

/** The models a page lists. */
export function models(page: string): Model[] {
  return page
    .split(/<div class="model( [^"]*)?">/)
    .slice(1)
    .filter((block) => block !== undefined && block.includes('<h3>'))
    .map((block) => ({
      heading: plainText(/<h3>([\s\S]*?)<\/h3>/.exec(block)?.[1] ?? ''),
      specifications: [...block.matchAll(/<div class="specification"><label>([\s\S]*?)<\/label>\s*<p class="specification__standard">([\s\S]*?)<\/p>\s*<p class="specification__metric">([\s\S]*?)<\/p>/g)].map(
        ([, label, standard, metric]) => ({ label: plainText(label!), standard: plainText(standard!), metric: plainText(metric!) }),
      ),
    }));
}

/** The gun one model describes, or why it is not one. */
export function gunFrom(model: Model, url: string, retrieved: string): PageReading {
  // The labels vary from page to page (`Weight Unloaded`, `Weight (Unloaded)`, `WEIGHT UNLOADED`), so
  // they are compared without case, parentheses and the words around them.
  const find = (...labels: string[]) => {
    const entry = model.specifications.find((candidate) => labels.includes(candidate.label.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim()));
    return entry === undefined ? undefined : [entry.standard, entry.metric].filter((part) => part !== '').join(' | ');
  };
  // A cartridge is a name, and has no metric twin; a few pages put it in the metric column.
  const caliberEntry = model.specifications.find((entry) => entry.label.toLowerCase() === 'caliber');
  const caliber = caliberEntry === undefined ? undefined : caliberEntry.standard || caliberEntry.metric;
  const barrelText = find('barrel length');
  const unloaded = find('weight unloaded', 'weight');
  const loadedOnly = unloaded === undefined ? find('weight loaded') : undefined;
  const weightText = unloaded ?? loadedOnly;
  const twistText = find('twist', 'twist rate', 'rifling');
  if (caliber === undefined || !loadableCartridge(caliber)) return { skipped: `${model.heading}: no loadable cartridge (${caliber ?? 'none printed'})` };
  const barrelLength = barrelText === undefined ? undefined : length(barrelText);
  if (barrelLength === undefined) return { skipped: `${model.heading}: no barrel length printed` };
  const gunMass = weightText === undefined ? undefined : mass(weightText);
  const modelName = model.heading.replace(/^(Kel-?Tec|The)\s+/i, '');
  return {
    firearm: firearmRecord({
      maker: 'Kel-Tec',
      publisher: 'Kel-Tec CNC Industries, Inc.',
      name: withMaker('Kel-Tec', modelName),
      model: modelName,
      cartridge: caliber,
      barrelLength,
      twistLength: twistText === undefined ? undefined : twist(twistText),
      gunMass,
      massBasis: loadedOnly === undefined ? 'unstated' : 'loaded',
      url,
      retrieved,
      published: { caliber, barrelLength: barrelText, weight: weightText, twist: twistText },
    }),
  };
}

/** The guns a page lists. */
export function readPage(page: string, url: string, retrieved: string): PageReading[] {
  const listed = models(page);
  if (listed.length === 0) return [{ skipped: 'no model with specifications' }];
  return listed.map((model) => gunFrom(model, url, retrieved));
}

async function main(): Promise<void> {
  const urls = [...(await fetchText(SITEMAP)).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url!).filter((url) => /\/firearm\/[a-z0-9-]+\/[a-z0-9-]+\/?$/.test(url));
  await crawl('kel-tec', urls, readPage);
}

if (import.meta.main) await main();
