import { describe, expect, it } from 'vitest';
import { firearmFrom, loadable, metric, modelFrom, specifications } from '../../../tools/data/firearms/glock.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/glock.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — their own text is not reproduced, and the
 * figures are made up.
 */

const PAGE = `<html><head><title>GLOCK 17 Gen5</title></head><body>
<div class="TechnicalDataSection_technical-data-item__x">
  <div class="TechnicalDataSection_technical-data-item-content__y">
    <h3 class="TechnicalDataSection_technical-data-item-title__z">Caliber</h3>
    <h4 class="TechnicalDataSection_technical-data-item-subtitle__w">
</h4>
    <p class="TechnicalDataSection_technical-data-item-data__v">9x19 mm</p>
  </div>
  <div class="TechnicalDataSection_technical-data-item-content__y">
    <h3 class="TechnicalDataSection_technical-data-item-title__z">Barrel Length</h3>
    <h4 class="TechnicalDataSection_technical-data-item-subtitle__w">
</h4>
    <p class="TechnicalDataSection_technical-data-item-data__v">111 mm  | 4.37 inch</p>
  </div>
  <div class="TechnicalDataSection_technical-data-item-content__y">
    <h3 class="TechnicalDataSection_technical-data-item-title__z">Weight</h3>
    <h4 class="TechnicalDataSection_technical-data-item-subtitle__w">without magazine</h4>
    <p class="TechnicalDataSection_technical-data-item-data__v">600 g  | 21.16 oz</p>
  </div>
  <div class="TechnicalDataSection_technical-data-item-content__y">
    <h3 class="TechnicalDataSection_technical-data-item-title__z">Weight</h3>
    <h4 class="TechnicalDataSection_technical-data-item-subtitle__w">with empty magazine</h4>
    <p class="TechnicalDataSection_technical-data-item-data__v">700 g  | 24.69 oz</p>
  </div>
</div></body></html>`;

const TRAINING_PAGE = PAGE.replace('9x19 mm', 'Training ammunition').replace('GLOCK 17 Gen5', 'G17T Gen5 FX/FOF');

describe('reading a published specification', () => {
  it('finds every line of the technical data', () => {
    const items = specifications(PAGE);
    expect(items.map((item) => item.title)).toEqual(['Caliber', 'Barrel Length', 'Weight', 'Weight']);
    expect(items[3]).toEqual({ title: 'Weight', subtitle: 'with empty magazine', value: '700 g  | 24.69 oz' });
  });

  it('takes the metric value, never the imperial one beside it', () => {
    expect(metric('111 mm  | 4.37 inch', 'mm')).toBeCloseTo(0.111, 12);
    expect(metric('700 g  | 24.69 oz', 'g')).toBeCloseTo(0.7, 12);
    expect(metric('no figure here', 'mm')).toBeUndefined();
  });

  it('tells a cartridge from a marking round or a rimfire', () => {
    expect(loadable('9x19 mm')).toBe(true);
    expect(loadable('.45 Auto')).toBe(true);
    expect(loadable('Training ammunition')).toBe(false);
    expect(loadable('22 LR')).toBe(false);
  });

  it('finds the model wherever the site puts its own name in the title', () => {
    expect(modelFrom('GLOCK 17 Gen5')).toBe('17 Gen5');
    expect(modelFrom('GLOCK 17 | GLOCK 17 | The Original')).toBe('17');
    expect(modelFrom('Glock Firearms | G45 Gen6')).toBe('45 Gen6');
    expect(modelFrom('G23 Cut')).toBe('23 Cut');
    expect(modelFrom('GLOCK 17 Gen4 - G17 Gen4 - Buy Guns Online')).toBe('17 Gen4');
    expect(modelFrom('Owner’s manuals')).toBeUndefined();
  });

  it('builds a gun with its mass as it recoils and where the figures come from', () => {
    const firearm = firearmFrom(PAGE, 'https://example.invalid/g17', '2026-10-15');
    expect(firearm).toBeDefined();
    expect(firearm!.name).toBe('Glock 17 Gen5');
    expect(firearm!.maker).toBe('Glock');
    expect(firearm!.cartridge).toBe('9x19 mm');
    expect(firearm!.barrel.length).toBeCloseTo(0.111, 12);
    // With the empty magazine, not without it: that is the gun that recoils.
    expect(firearm!.barrel.gunMass).toBeCloseTo(0.7, 12);
    expect(firearm!.source).toEqual({
      kind: 'published',
      publisher: 'Glock Ges.m.b.H.',
      url: 'https://example.invalid/g17',
      retrieved: '2026-10-15',
      // Which of their three weights was taken, and both figures as the page prints them.
      massBasis: 'empty-magazine',
      published: { barrelLength: '111 mm | 4.37 inch', weight: '700 g | 24.69 oz' },
    });
  });

  it('leaves out what a reloader cannot load for', () => {
    expect(firearmFrom(TRAINING_PAGE, 'https://example.invalid/g17t', '2026-10-15')).toBeUndefined();
  });
});
