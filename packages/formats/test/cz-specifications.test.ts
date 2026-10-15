import { describe, expect, it } from 'vitest';
import { firearmFrom, loadable, metricValue, pageData, twistLength, variantsOf } from '../../../tools/data/firearms/cz.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/cz.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — specifications inside the script chunks
 * the server embeds — and its text is not reproduced; the figures are made up.
 */

/** One attribute record as the page's data writes it. */
function attribute(key: string, value: { text?: string; metric?: string; unit?: string }): string {
  const text = value.text === undefined ? 'null' : JSON.stringify(value.text);
  const metric = value.metric === undefined ? 'null' : JSON.stringify(value.metric);
  const unit = value.unit === undefined ? 'null' : JSON.stringify(value.unit);
  return (
    `{"value":null,"enumValue":${text},"valueMetric":${metric},"valueImperial":null,` +
    `"productAttribute":{"documentId":"x","key":"${key}","title":"T","isMultipleOptions":null,"orderPriority":1,"isNumericValue":null,"metricUnit":${unit},"imperialUnit":null}}`
  );
}

function variant(title: string, attributes: string[]): string {
  return `{"title":"${title}","productAttributes":[${attributes.join(',')}]}`;
}

/** The page wraps its data in script chunks, each a JSON string literal. */
function pageWith(data: string): string {
  const half = Math.floor(data.length / 2);
  const chunks = [data.slice(0, half), data.slice(half)];
  return `<html><body>${chunks.map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join('')}</body></html>`;
}

const RIFLE_VARIANTS = [
  variant('CZ 600+ EXAMPLE 308 Win.', [
    attribute('kaliber', { text: '308 Win.' }),
    attribute('dralllange-anzahl-der-zuge', { text: '1 : 10 / 6' }),
    attribute('lauflange', { metric: '610', unit: 'mm' }),
    attribute('gewicht', { metric: '3.45', unit: 'kg' }),
  ]),
  variant('CZ 600+ EXAMPLE 22 LR', [attribute('kaliber', { text: '22 LR' }), attribute('lauflange', { metric: '500', unit: 'mm' })]),
  variant('CZ 600+ EXAMPLE NO BARREL', [attribute('kaliber', { text: '6.5 Creedmoor' })]),
];
/** The data repeats the variants further down; a reader must not count them twice. */
const PAGE = pageWith(`{"title":"CZ 600+ EXAMPLE","variants":[${RIFLE_VARIANTS.join(',')}]},"related":[${RIFLE_VARIANTS[0]}]`);

describe('reading a published specification', () => {
  it('decodes the data chunks the server embeds', () => {
    expect(pageData(PAGE)).toContain('"title":"CZ 600+ EXAMPLE 308 Win."');
  });

  it('finds each variant once, with its attributes', () => {
    const variants = variantsOf(PAGE);
    expect(variants.map((entry) => entry.title)).toEqual(['CZ 600+ EXAMPLE 308 Win.', 'CZ 600+ EXAMPLE 22 LR', 'CZ 600+ EXAMPLE NO BARREL']);
    expect(variants[0]!.attributes.find((entry) => entry.key === 'lauflange')).toEqual({ key: 'lauflange', metric: '610', unit: 'mm' });
  });

  it('converts the metric value by its unit, never guessing one', () => {
    expect(metricValue({ key: 'lauflange', metric: '610', unit: 'mm' })).toBeCloseTo(0.61, 12);
    expect(metricValue({ key: 'gewicht', metric: '1170', unit: 'g' })).toBeCloseTo(1.17, 12);
    expect(metricValue({ key: 'gewicht', metric: '3,45', unit: 'kg' })).toBeCloseTo(3.45, 12);
    expect(metricValue({ key: 'x', metric: '4-6', unit: 'N' })).toBeUndefined();
    expect(metricValue({ key: 'x', metric: '610' })).toBeUndefined();
  });

  it('reads the twist as inches or millimetres per turn, and leaves a doubtful number out', () => {
    expect(twistLength('1 : 10 / 6')).toBeCloseTo(0.254, 12);
    expect(twistLength('1:250 mm')).toBeCloseTo(0.25, 12);
    expect(twistLength('1 : 60')).toBeUndefined();
    expect(twistLength(undefined)).toBeUndefined();
  });

  it('tells a cartridge from a rimfire', () => {
    expect(loadable('308 Win.')).toBe(true);
    expect(loadable('9 × 19')).toBe(true);
    expect(loadable('22 LR')).toBe(false);
    expect(loadable('22 WMR')).toBe(false);
  });

  it('builds a gun with its twist, its mass and where the figures come from', () => {
    const firearm = firearmFrom(variantsOf(PAGE)[0]!, 'https://example.invalid/rifle', '2026-10-15');
    expect(firearm!.name).toBe('CZ 600+ EXAMPLE 308 Win.');
    expect(firearm!.maker).toBe('CZ');
    expect(firearm!.cartridge).toBe('308 Win.');
    expect(firearm!.barrel.length).toBeCloseTo(0.61, 12);
    expect(firearm!.barrel.twistLength).toBeCloseTo(0.254, 12);
    expect(firearm!.barrel.gunMass).toBeCloseTo(3.45, 12);
    expect(firearm!.source).toEqual({
      kind: 'published',
      publisher: 'Česká zbrojovka a.s.',
      url: 'https://example.invalid/rifle',
      retrieved: '2026-10-15',
      // A rifle: one weight, with nothing said about what it covers.
      massBasis: 'unstated',
      published: { barrelLength: '610 mm', weight: '3.45 kg', twist: '1 : 10 / 6' },
    });
  });

  it('leaves out a rimfire and a variant with no barrel length', () => {
    const [, rimfire, noBarrel] = variantsOf(PAGE);
    expect(firearmFrom(rimfire!, 'https://example.invalid/rifle', '2026-10-15')).toBeUndefined();
    expect(firearmFrom(noBarrel!, 'https://example.invalid/rifle', '2026-10-15')).toBeUndefined();
  });
});
