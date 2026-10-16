import { describe, expect, it } from 'vitest';
import { firearmFrom, length, links, mass, modelFrom, specifications, twistLength } from '../../../tools/data/firearms/ruger.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/ruger.ts, issue #30). The page
 * below is written here in the shape the maker's pages have — their own text is not reproduced, and the
 * figures are made up.
 */

const PAGE = `<html><head><title>Maker&reg; Rifle Model 9001</title></head><body>
<div class="title"><h1>Rifle<sup>&reg;</sup> Example</h1></div>
<div class="content specs">
  <ul class="big-specs">
    <li>Model Number: <span class="text-red">9001</span></li>
    <li>Caliber: <span class="text-red">6.5 Creedmoor</span></li>
  </ul>
  <ul class="small-specs">
    <li><em>Capacity</em><span>5</span></li>
    <li><em>Barrel Length</em><span><span class='measureI'>20.00&quot;</span><span class='measureM hidden'>50.8&#160;cm</span></span></li>
    <li><em>Weight</em><span><span class='measureI'>7.5&#160;lbs.</span><span class='measureM hidden'>3.4&#160;kg</span></span></li>
    <li><em>Twist</em><span>1:8" RH</span></li>
    <li><em>Suggested Retail</em><span>$1.00</span></li>
  </ul>
</div></body></html>`;

const PISTOL_PAGE = PAGE.replace('6.5 Creedmoor', '9mm Luger')
  .replace(/<li><em>Barrel Length.*\n/, `<li><em>Barrel Length</em><span><span class='measureI'>4.00&quot;</span><span class='measureM hidden'>102&#160;mm</span></span></li>\n`)
  .replace(/<li><em>Weight.*\n/, `<li><em>Weight</em><span><span class='measureI'>25.5&#160;oz.</span><span class='measureM hidden'>723&#160;g</span></span></li>\n`);

const RIMFIRE_PAGE = PAGE.replace('6.5 Creedmoor', '22 LR');

describe('reading a published specification', () => {
  it('finds the headline lines and the small ones', () => {
    const items = specifications(PAGE);
    expect(items.map((item) => item.title)).toEqual(['Model Number', 'Caliber', 'Capacity', 'Barrel Length', 'Weight', 'Twist', 'Suggested Retail']);
    expect(items.find((item) => item.title === 'Caliber')!.value).toBe('6.5 Creedmoor');
  });

  it('keeps whichever figure the sheet printed to the finer step, not the metric one by habit', () => {
    // 2.80 inch is printed to a hundredth of an inch, finer than the whole millimetre beside it.
    expect(length("<span class='measureI'>2.80&quot;</span><span class='measureM hidden'>71&#160;mm</span>")).toBeCloseTo(0.07112, 12);
    // The same rule the other way: a tenth of a centimetre is coarser than a hundredth of an inch.
    expect(length("<span class='measureI'>18.50&quot;</span><span class='measureM hidden'>46.9&#160;cm</span>")).toBeCloseTo(0.4699, 12);
    // A sheet that prints the millimetre to a tenth has said more than the inch does.
    expect(length("<span class='measureI'>2.8&quot;</span><span class='measureM hidden'>71.1&#160;mm</span>")).toBeCloseTo(0.0711, 12);
    expect(length("<span class='measureI'>16.50&quot;</span>")).toBeCloseTo(0.4191, 12);
    expect(length('no figure here')).toBeUndefined();
  });

  it('takes the mass in grams or kilograms, else from pounds and ounces', () => {
    // A gram is finer than a tenth of an ounce, so the metric figure wins here.
    expect(mass("<span class='measureI'>11.2&#160;oz.</span><span class='measureM hidden'>317&#160;g</span>")).toBeCloseTo(0.317, 12);
    // A hundredth of a kilogram is finer than a whole pound.
    expect(mass("<span class='measureI'>7&#160;lb.</span><span class='measureM hidden'>3.17&#160;kg</span>")).toBeCloseTo(3.17, 12);
    expect(mass("<span class='measureI'>7&#160;lbs. 8&#160;oz.</span>")).toBeCloseTo(7.5 * 0.45359237, 9);
    expect(mass('')).toBeUndefined();
  });

  it('reads a twist rate as the barrel length per turn', () => {
    expect(twistLength('1:8" RH')).toBeCloseTo(0.2032, 12);
    expect(twistLength('1:16&quot; LH')).toBeCloseTo(0.4064, 12);
    expect(twistLength('Varies')).toBeUndefined();
  });


  it('names the model from the sheet’s headline and its model number', () => {
    expect(modelFrom(PAGE, '9001')).toBe('Rifle Example 9001');
    expect(modelFrom('<h1>Ruger<sup>&reg;</sup> Example<sup>&reg;</sup></h1>', '9001')).toBe('Example 9001');
    expect(modelFrom('<html></html>', '9001')).toBeUndefined();
  });

  it('builds a gun with its twist, its mass and where the figures come from', () => {
    const firearm = firearmFrom(PAGE, 'https://example.invalid/specSheets/9001.html', '2026-10-15');
    expect(firearm).toBeDefined();
    expect(firearm!.name).toBe('Ruger Rifle Example 9001');
    expect(firearm!.maker).toBe('Ruger');
    expect(firearm!.cartridge).toBe('6.5 Creedmoor');
    expect(firearm!.barrel.length).toBeCloseTo(0.508, 12);
    expect(firearm!.barrel.twistLength).toBeCloseTo(0.2032, 12);
    // `7.5 lbs.` steps by 45 g, finer than the `3.4 kg` beside it, which steps by 100 g.
    expect(firearm!.barrel.gunMass).toBeCloseTo(7.5 * 0.45359237, 9);
    expect(firearm!.source).toEqual({
      kind: 'published',
      publisher: 'Sturm, Ruger & Co., Inc.',
      url: 'https://example.invalid/specSheets/9001.html',
      retrieved: '2026-10-15',
      // Ruger prints one Weight and does not say what it includes.
      massBasis: 'unstated',
      published: { barrelLength: '20.00" | 50.8 cm', weight: '7.5 lbs. | 3.4 kg', twist: '1:8" RH' },
    });
  });

  it('builds a pistol from millimetres and grams', () => {
    const firearm = firearmFrom(PISTOL_PAGE, 'https://example.invalid/specSheets/9001.html', '2026-10-15');
    expect(firearm!.barrel.length).toBeCloseTo(4 * 0.0254, 12);
    expect(firearm!.barrel.gunMass).toBeCloseTo(0.723, 12);
  });

  it('leaves out what a reloader cannot load for', () => {
    expect(firearmFrom(RIMFIRE_PAGE, 'https://example.invalid/specSheets/9002.html', '2026-10-15')).toBeUndefined();
  });

  it('finds the family pages and the specification sheets a page links to', () => {
    const page = `<a href="/products/familyA/models.html?n=bolt">A</a><a href="/products/familyB/overview.html">B</a>
      <a href="specSheets/1234.html?buy=1">sheet</a><a href="/shop/cart.html">cart</a>`;
    expect(links(page, 'https://ruger.com/products/familyA/models.html')).toEqual({
      families: ['https://ruger.com/products/familyA/models.html', 'https://ruger.com/products/familyB/overview.html'],
      sheets: ['https://ruger.com/products/familyA/specSheets/1234.html'],
    });
  });
});
