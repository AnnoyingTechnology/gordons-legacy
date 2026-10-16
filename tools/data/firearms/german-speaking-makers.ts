/**
 * What the German-speaking makers' extractors (haenel.ts, steyr.ts, schmeisser.ts, oberland-arms.ts)
 * read the same way: figures printed with a comma decimal and a dot for thousands, in metric with the
 * inch beside, and a page's text cut into lines.
 *
 * Nothing here knows a maker's page. It turns a string a maker printed into SI, or into `undefined`
 * when the string is not one unambiguous figure: a page that gives two barrel lengths in one cell, or
 * whose two units contradict each other, is a skipped gun and not a guessed one.
 */
import { units } from '@gordons-legacy/formats';
import { plainText } from './maker-site.ts';

/** A figure as printed, in SI, with what its last printed digit is worth (also SI). */
interface Reading {
  value: number;
  step: number;
}

/** How far two units of one measure may differ before the page is taken to contradict itself. */
const AGREEMENT = 0.02;

/** A number as these makers print it: `3,25`, `14.5`, `1.060` (thousands) or `4.350` (thousands of grams). */
const NUMBER = String.raw`([0-9]+(?:[.,][0-9]+)?)`;

/**
 * The value of a printed number and the step of its last digit, in the unit it was printed in.
 *
 * `grouped` says a dot followed by exactly three digits is a thousands separator (`4.350 g`,
 * `1.060 mm`), which only the units that never carry three decimals can say.
 */
function printedNumber(printed: string, grouped: boolean): { value: number; step: number } {
  if (grouped && /^[0-9]{1,3}\.[0-9]{3}$/.test(printed)) return { value: Number(printed.replace('.', '')), step: 1 };
  const normal = printed.replace(',', '.');
  const decimals = normal.split('.')[1]?.length ?? 0;
  return { value: Number(normal), step: 10 ** -decimals };
}

/** Every length in a string, whichever unit it is printed in: `37 cm / 14.5"` is two readings. */
function lengthReadings(text: string): Reading[] {
  const readings: Reading[] = [];
  for (const [, printed, unit] of text.matchAll(new RegExp(`${NUMBER}\\s*(mm|cm|"|in\\b)`, 'gi'))) {
    const metres = { mm: units.MILLIMETRE, cm: 10 * units.MILLIMETRE, '"': units.INCH, in: units.INCH }[unit!.toLowerCase()]!;
    const { value, step } = printedNumber(printed!, unit!.toLowerCase() === 'mm');
    readings.push({ value: value * metres, step: step * metres });
  }
  return readings;
}

/**
 * One length from a string such as `37 cm / 14.5"` or `508 mm / 20"`, in metres, taking whichever unit
 * the maker printed to the finer step (a barrel of 14.5" is 368.3 mm, and the `37 cm` beside it has
 * lost the digit). `undefined` when there is none, or when the readings disagree by more than 2%: that
 * is either two lengths in one cell or a page whose own units contradict each other.
 */
export function printedLength(text: string): number | undefined {
  const readings = lengthReadings(text);
  if (readings.length === 0) return undefined;
  const finest = readings.reduce((best, reading) => (reading.step < best.step ? reading : best));
  const agree = readings.every((reading) => Math.abs(reading.value - finest.value) <= AGREEMENT * finest.value);
  return agree ? finest.value : undefined;
}

/**
 * One metric mass from a string such as `ca. 3,1 kg`, `3.250 g` or `787 g / 27.76 oz`, in kilograms.
 * The pound or ounce beside it is the conversion of the metric figure and is never read, so it cannot
 * claim a precision the maker did not have. `undefined` when there is not exactly one metric figure.
 */
export function printedMass(text: string): number | undefined {
  const masses = [...text.matchAll(new RegExp(`${NUMBER}\\s*(kg|g)\\b`, 'gi'))].map(([, printed, unit]) => {
    const kilograms = unit!.toLowerCase() === 'kg' ? 1 : units.GRAM;
    return printedNumber(printed!, unit!.toLowerCase() === 'g').value * kilograms;
  });
  return masses.length === 1 ? masses[0] : undefined;
}

/**
 * A twist in metres per turn from `1:9`, `1:12"`, `1 in 10"`, `1 turn right in 7,9"` or a bare `12"`.
 * Every one of these makers prints inches (they sell AR-pattern and hunting rifles in the US
 * convention), and a bare ratio is read as inches only when that is a twist a rifle can have: `1:9`
 * could not be nine millimetres or nine centimetres. A millimetre or centimetre mark is honoured.
 */
export function printedTwist(text: string): number | undefined {
  const match = new RegExp(`^\\s*(?:1\\s*(?::|in\\b|turn\\s+(?:right|left)\\s+in)\\s*)?${NUMBER}\\s*("|mm\\b|cm\\b)?\\s*$`, 'i').exec(text);
  if (!match) return undefined;
  const { value } = printedNumber(match[1]!, false);
  const unit = match[2]?.toLowerCase();
  const metres = unit === 'mm' ? units.MILLIMETRE : unit === 'cm' ? 10 * units.MILLIMETRE : units.INCH;
  const twist = value * metres;
  return twist >= 4 * units.INCH && twist <= 40 * units.INCH ? twist : undefined;
}


/** A page's visible text as one line per block element, entities decoded; scripts and styles dropped. */
export function textLines(markup: string): string[] {
  return markup
    .replace(/<(script|style)\b[^>]*>.*?<\/\1>/gis, ' ')
    .replace(/<\/(p|div|span|h[1-6]|li|tr|td|th|dd|dt|label)>|<br\s*\/?>/gi, '\n')
    .split('\n')
    .map((line) => plainText(line))
    .filter((line) => line !== '');
}

/** The text of a page's `<title>`, entities decoded. */
export function pageTitle(page: string): string | undefined {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(page)?.[1];
  return title === undefined ? undefined : plainText(title);
}

/** Every `<loc>` of a sitemap. */
export function sitemapLocations(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>\s*([^<\s]*)\s*<\/loc>/g)].map(([, url]) => url!);
}

/**
 * The names that more than one gun of a crawl carries, with those guns. An extractor settles these
 * before it writes anything, because the second file of a name would silently replace the first.
 */
export function clashes<T extends { name: string }>(guns: readonly T[]): Map<string, T[]> {
  const byName = new Map<string, T[]>();
  for (const gun of guns) byName.set(gun.name, [...(byName.get(gun.name) ?? []), gun]);
  return new Map([...byName].filter(([, same]) => same.length > 1));
}
