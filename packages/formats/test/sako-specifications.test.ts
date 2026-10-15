import { describe, expect, it } from 'vitest';
import { cartridgeName, firearmsFrom, loadable, modelName, twistLength, variantsOf } from '../../../tools/data/firearms/sako.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/sako.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — a `__NEXT_DATA__` script with the
 * variants of a rifle — and its text is not reproduced; the figures are made up.
 */

function variant(fields: { cartridge: string; twist: string; barrel: number; weight: number; hand?: string }) {
  const code = fields.cartridge.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return {
    pimId: 'EXAMPLE',
    rifleCaliber: code,
    rifleHandedness: fields.hand ?? 'right',
    rifleRateOfTwist: fields.twist.replace(/[^0-9]+/g, '_'),
    rifleBarrelLength: fields.barrel,
    rifleProductTotalWeight: fields.weight,
    translations: {
      'productSubmodel.T3x_EXAMPLE_BASIC': 'T3X Example Basic',
      [`rifleCaliber.${code}`]: fields.cartridge,
      [`rifleRateOfTwist.${fields.twist.replace(/[^0-9]+/g, '_')}`]: fields.twist,
    },
  };
}

const PAGE_DATA = {
  props: {
    pageProps: {
      page: {
        content: {
          submodels: [
            {
              variants: [
                variant({ cartridge: '6,5 Creedmoor', twist: '1:8"', barrel: 500, weight: 3 }),
                // The same rifle, left handed and a hundred grams heavier: one gun, carrying the first
                // variant's own figures and saying that the mass varies between them.
                variant({ cartridge: '6,5 Creedmoor', twist: '1:8"', barrel: 500, weight: 3.1, hand: 'left' }),
                variant({ cartridge: '6,5 Creedmoor', twist: '1:8"', barrel: 600, weight: 3.4 }),
                variant({ cartridge: '308 Win.', twist: '1:11"', barrel: 500, weight: 3 }),
                variant({ cartridge: '22 LR', twist: '1:16"', barrel: 500, weight: 2 }),
              ],
            },
          ],
        },
      },
    },
  },
};
const PAGE = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(PAGE_DATA)}</script></body></html>`;

describe('reading a published specification', () => {
  it('finds every variant of a rifle with the words the page gives', () => {
    const variants = variantsOf(PAGE);
    expect(variants).toHaveLength(5);
    expect(variants[0]).toEqual({ model: 'T3X Example Basic', cartridge: '6,5 Creedmoor', barrelLength: 500, twist: '1:8"', mass: 3 });
    expect(variantsOf('<html>no data</html>')).toEqual([]);
  });

  it('reads the twist in inches or millimetres per turn, and nothing without a unit', () => {
    expect(twistLength('1:8"')).toBeCloseTo(0.2032, 12);
    expect(twistLength('1:9,5"')).toBeCloseTo(0.2413, 12);
    expect(twistLength('1:200 mm')).toBeCloseTo(0.2, 12);
    expect(twistLength('1:8')).toBeUndefined();
    expect(twistLength(undefined)).toBeUndefined();
  });

  it('writes decimals with a point, and tells a cartridge from a rimfire', () => {
    expect(cartridgeName('6,5 x 55 SE')).toBe('6.5 x 55 SE');
    expect(loadable('308 Win.')).toBe(true);
    expect(loadable('22 LR')).toBe(false);
  });

  it('writes the model as Tikka does when the page gives a code or capitals', () => {
    expect(modelName('T3X Lite Basic')).toBe('T3x Lite Basic');
    expect(modelName('T3x_VARMINT_BASIC')).toBe('T3x Varmint Basic');
    expect(modelName('Sako 90 Hunter Basic')).toBe('Sako 90 Hunter Basic');
  });

  it('makes one gun of each model, cartridge and barrel, with a published mass and the source', () => {
    const guns = firearmsFrom(variantsOf(PAGE), 'https://example.invalid/rifle/t3x-example', '2026-10-15');
    expect(guns.map((gun) => gun.name)).toEqual([
      'Tikka T3x Example Basic 6.5 Creedmoor 500 mm',
      'Tikka T3x Example Basic 6.5 Creedmoor 600 mm',
      'Tikka T3x Example Basic 308 Win. 500 mm',
    ]);
    const first = guns[0]!;
    expect(first.maker).toBe('Tikka');
    expect(first.cartridge).toBe('6.5 Creedmoor');
    expect(first.barrel.length).toBeCloseTo(0.5, 12);
    expect(first.barrel.twistLength).toBeCloseTo(0.2032, 12);
    // The first variant's own 3 kg, not the 3.05 kg mean of the two: a mean is a figure nobody printed.
    expect(first.barrel.gunMass).toBeCloseTo(3, 12);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Sako Ltd',
      url: 'https://example.invalid/rifle/t3x-example',
      retrieved: '2026-10-15',
      massBasis: 'unstated',
      published: { barrelLength: '500 mm', weight: '3 kg', twist: '1:8"', massVaries: '3 kg, 3.1 kg' },
    });
  });
});
