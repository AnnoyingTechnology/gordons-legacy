import { describe, expect, it } from 'vitest';
import { chamberings, firearmsFrom, length, loadable, mass, modelFrom, twistLength } from '../../../tools/data/firearms/browning.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/browning.ts, issue #30). The
 * page below is written here in the shape the maker's pages have — one block per chambering, each a
 * table of titled values in inches and pounds — and its text is not reproduced; the figures are made up.
 */

function block(index: number, values: Record<string, string>): string {
  const cells = Object.entries(values)
    .map(([key, value]) => `<td class="spec-row"><b class="spec-key">${key}</b> <span class="spec-val">${value}</span></td>`)
    .join('\n');
  return `<div class="tab-pane fade" id="riflesoption${index}"><table class="specsTable"><tr>${cells}</tr></table></div>`;
}

const PAGE = `<html><head><title>Example 9 Hunter - Bolt-Action Rifle - Browning</title></head><body>
<h1 class="ecomm-fa-product-title">Example 9 Hunter</h1>
${block(0, { 'Item Number': '000000001', Caliber: '308 Win', 'Barrel Length': '22&#34;', Weight: '6 lbs 7 oz', 'Twist Rate': '10&#34;' })}
${block(1, { Caliber: '6.5 CREEDMOOR', 'Barrel Length': '24&#34;', Weight: '7 lbs 1 oz', 'Twist Rate': '7 1/2&#34;' })}
${block(2, { Caliber: '22 LR', 'Barrel Length': '20&#34;', Weight: '5 lbs', 'Twist Rate': '16&#34;' })}
${block(3, { Caliber: '300 WIN MAG', 'Barrel Length': '26&#34;', Weight: '9999 lbs', 'Twist Rate': 'Varies' })}
${block(4, { Caliber: '270 Win', 'Barrel Length': 'See dealer', Weight: '7 lbs', 'Twist Rate': '10&#34;' })}
</body></html>`;

describe('reading a published specification', () => {
  it('splits a page into its chamberings, one per block', () => {
    const found = chamberings(PAGE);
    expect(found).toHaveLength(5);
    expect(found[0]!.find((item) => item.title === 'Barrel Length')?.value).toBe('22"');
    expect(found[1]!.find((item) => item.title === 'Twist Rate')?.value).toBe('7 1/2"');
  });

  it('finds the model in the headline, and in the title when there is none', () => {
    expect(modelFrom(PAGE)).toBe('Example 9 Hunter');
    expect(modelFrom('<title>Example 9 - Bolt-Action Rifle - Browning</title>')).toBe('Example 9');
  });

  it('reads a barrel length in inches, with a fraction, and requires the unit', () => {
    expect(length('22"')).toBeCloseTo(0.5588, 12);
    expect(length('26 1/2"')).toBeCloseTo(26.5 * 0.0254, 12);
    expect(length('22')).toBeUndefined();
    expect(length('See dealer')).toBeUndefined();
  });

  it('reads the twist as inches per turn, and nothing else', () => {
    expect(twistLength('10"')).toBeCloseTo(0.254, 12);
    expect(twistLength('7 1/2"')).toBeCloseTo(7.5 * 0.0254, 12);
    expect(twistLength('1:9"')).toBeCloseTo(9 * 0.0254, 12);
    expect(twistLength('Varies')).toBeUndefined();
    expect(twistLength('10')).toBeUndefined();
  });

  it('reads a mass in pounds and ounces, and rejects a placeholder', () => {
    expect(mass('6 lbs 7 oz')).toBeCloseTo((6 + 7 / 16) * 0.45359237, 9);
    expect(mass('7 lbs.')).toBeCloseTo(7 * 0.45359237, 9);
    expect(mass('9999 lbs')).toBeUndefined();
    expect(mass('3 kg')).toBeUndefined();
    expect(mass(undefined)).toBeUndefined();
  });

  it('tells a cartridge from a rimfire or a shotgun gauge', () => {
    expect(loadable('308 Win')).toBe(true);
    expect(loadable('6.5 CREEDMOOR')).toBe(true);
    expect(loadable('22 LR')).toBe(false);
    expect(loadable('22 WMR')).toBe(false);
    expect(loadable('17 HMR')).toBe(false);
    expect(loadable('12 Gauge')).toBe(false);
    expect(loadable('308 Win / 30-06')).toBe(false);
    expect(loadable('223 Rem')).toBe(true);
  });

  it('builds one gun per loadable chambering and says what it left out', () => {
    const { guns, skipped } = firearmsFrom(PAGE, 'https://example.invalid/rifles/example-9.html', '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Browning Example 9 Hunter 308 Win', 'Browning Example 9 Hunter 6.5 CREEDMOOR', 'Browning Example 9 Hunter 300 WIN MAG']);
    expect(skipped.map((skip) => skip.why)).toEqual(['not loadable (22 LR)', 'no readable barrel length (See dealer)']);
    const first = guns[0]!;
    expect(first.maker).toBe('Browning');
    expect(first.cartridge).toBe('308 Win');
    expect(first.barrel.length).toBeCloseTo(0.5588, 12);
    expect(first.barrel.twistLength).toBeCloseTo(0.254, 12);
    expect(first.barrel.gunMass).toBeCloseTo((6 + 7 / 16) * 0.45359237, 9);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Browning',
      url: 'https://example.invalid/rifles/example-9.html',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { barrelLength: '22"', weight: '6 lbs 7 oz', twist: '10"' },
    });
  });

  it('keeps a gun whose twist and weight are unusable, without them and without a mass basis', () => {
    const gun = firearmsFrom(PAGE, 'https://example.invalid/x.html', '2026-10-16').guns[2]!;
    expect(gun.barrel.twistLength).toBeUndefined();
    expect(gun.barrel.gunMass).toBeUndefined();
    expect(gun.source?.massBasis).toBeUndefined();
    expect(gun.source?.published).toEqual({ barrelLength: '26"', weight: '9999 lbs', twist: 'Varies' });
  });

  it('tells the same cartridge in two barrel lengths apart, and merges identical blocks', () => {
    const page = `<h1>Example 10</h1>${block(0, { Caliber: '308 Win', 'Barrel Length': '20"', Weight: '6 lbs' })}${block(1, { Caliber: '308 Win', 'Barrel Length': '24"', Weight: '7 lbs' })}${block(2, { Caliber: '308 Win', 'Barrel Length': '24"', Weight: '7 lbs' })}`;
    const { guns, skipped } = firearmsFrom(page, 'https://example.invalid/y.html', '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Browning Example 10 308 Win 20"', 'Browning Example 10 308 Win 24"']);
    expect(skipped).toEqual([]);
  });
});
