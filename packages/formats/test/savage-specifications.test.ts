import { describe, expect, it } from 'vitest';
import { firearmFrom, length, loadable, mass, modelFromTitle, properties, skuRows, twistLength } from '../../../tools/data/firearms/savage.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/savage.ts, issue #30). The pages
 * below are written here in the shape the maker's pages have — a model page listing SKU rows, a SKU page
 * with a property table — and their text is not reproduced; the figures are made up.
 */

const MODEL_PAGE = `<html><head><title>Example 99 Rifle Package | Savage Arms</title></head><body>
<div class="sku_data" onClick="window.location.href='/firearms/sku/10001'">
  <div class="p-2">SKU: 10001</div><div class="p-2">
    CALIBER:
    308 Win
  </div><div class="p-2">
    BARREL LENGTH:
    22&quot; (55.9 cm)
  </div>
</div>
<div class="sku_data" onClick="window.location.href='/firearms/sku/10002'">
  <div class="p-2">
    CALIBER:
    308 Win
  </div><div class="p-2">
    BARREL LENGTH:
    22&quot; (55.9 cm)
  </div>
</div>
<div class="sku_data" onClick="window.location.href='/firearms/sku/10001'">
  <div class="p-2">
    CALIBER:
    308 Win
  </div><div class="p-2">
    BARREL LENGTH:
    22&quot; (55.9 cm)
  </div>
</div></body></html>`;

function row(name: string, value: string): string {
  return `<tr class="border-b"><td scope="row" class="px-6 text-right">\n    ${name}\n  </td>\n  <td class="px-6 py-4">${value}</td></tr>`;
}

function skuPage(fields: { type: string; caliber: string; barrel: string; twist: string; weight: string }): string {
  return `<html><body><table>${[
    row('Caliber', fields.caliber),
    row('Firearm Type', fields.type),
    row('Barrel Length', fields.barrel),
    row('Rate of Twist', fields.twist),
    row('Weight', fields.weight),
  ].join('')}</table></body></html>`;
}

const SKU_PAGE = skuPage({ type: 'Centerfire', caliber: '308 Win', barrel: '22&quot; (55.9 cm)', twist: '1:10&quot;', weight: '7.1 lbs (3.22 kg)' });

describe('reading a published specification', () => {
  it('finds the model in the page title, without the way it is sold', () => {
    expect(modelFromTitle(MODEL_PAGE)).toBe('Example 99');
  });

  it('lists each SKU of a model page once, with its cartridge and barrel length', () => {
    expect(skuRows(MODEL_PAGE)).toEqual([
      { sku: '10001', cartridge: '308 Win', barrelLength: '22" (55.9 cm)' },
      { sku: '10002', cartridge: '308 Win', barrelLength: '22" (55.9 cm)' },
    ]);
  });

  it('reads the property table of a SKU page', () => {
    const table = properties(SKU_PAGE);
    expect(table.get('Rate of Twist')).toBe('1:10"');
    expect(table.get('Weight')).toBe('7.1 lbs (3.22 kg)');
  });

  it('takes the metric figure when the page gives both, else converts the imperial one', () => {
    expect(length('22" (55.9 cm)')).toBeCloseTo(0.559, 12);
    expect(length('18"')).toBeCloseTo(0.4572, 12);
    expect(length('long')).toBeUndefined();
    expect(mass('7.1 lbs (3.22 kg)')).toBeCloseTo(3.22, 12);
    expect(mass('7 lbs')).toBeCloseTo(3.175, 3);
  });

  it('reads the twist in inches per turn, and nothing without the inch mark', () => {
    expect(twistLength('1:10"')).toBeCloseTo(0.254, 12);
    expect(twistLength('1:10')).toBeUndefined();
  });

  it('tells a cartridge from a rimfire or a shotgun gauge', () => {
    expect(loadable('308 Win')).toBe(true);
    expect(loadable('6.5 Creedmoor')).toBe(true);
    expect(loadable('22 LR')).toBe(false);
    expect(loadable('17 HMR')).toBe(false);
    expect(loadable('12 Gauge')).toBe(false);
  });

  it('builds a gun with its twist, its mass and where the figures come from', () => {
    const firearm = firearmFrom(SKU_PAGE, 'Example 99', 'https://example.invalid/sku/10001', '2026-10-15');
    expect(firearm!.name).toBe('Savage Example 99 308 Win 559 mm');
    expect(firearm!.cartridge).toBe('308 Win');
    expect(firearm!.barrel.length).toBeCloseTo(0.559, 12);
    expect(firearm!.barrel.twistLength).toBeCloseTo(0.254, 12);
    expect(firearm!.barrel.gunMass).toBeCloseTo(3.22, 12);
    expect(firearm!.source).toEqual({
      kind: 'published',
      publisher: 'Savage Arms',
      url: 'https://example.invalid/sku/10001',
      retrieved: '2026-10-15',
      massBasis: 'unstated',
      published: { barrelLength: '22" (55.9 cm)', weight: '7.1 lbs (3.22 kg)', twist: '1:10"' },
    });
    expect(firearm!.notes).toBeUndefined();
  });

  it('warns where the maker sells the model with a scope, since its weight may include it', () => {
    const packaged = firearmFrom(SKU_PAGE, 'Example 110 Apex Hunter XP', 'https://example.invalid/sku/10001', '2026-10-15');
    expect(packaged!.notes).toMatch(/scope/i);
  });

  it('leaves out a rimfire', () => {
    const rimfire = skuPage({ type: 'Rimfire', caliber: '22 LR', barrel: '18&quot; (45.7 cm)', twist: '1:16&quot;', weight: '5 lbs (2.27 kg)' });
    expect(firearmFrom(rimfire, 'Example', 'https://example.invalid/sku/1', '2026-10-15')).toBeUndefined();
  });
});
