import { describe, expect, it } from 'vitest';
import { barrelLine, gunCategories, headingAgrees, headingBarrel, productLinks, readPage } from '../../../tools/data/firearms/wilson-combat.ts';

/**
 * Reading Wilson Combat's published specifications (tools/data/firearms/wilson-combat.ts, issue #30).
 * The pages below are in the shape of the shop's product pages — a heading naming the gun as sold, a
 * Specifications tab of text lines — with invented guns and figures.
 *
 * What this maker's shape costs: a rifle's twist is printed only in the heading (`1-15 Twist`); a
 * pistol prints no `Barrel Length:` at all, only a build list where the barrel is one feature line among
 * others about the slide and the parts fitted to the barrel; and the catalogue's products are mostly not
 * guns, so a page is read only if a gun category links it.
 */
function productPage(heading: string, lines: string[]): string {
  return `<html><body><h1 class="productView-title main-heading">${heading}</h1>
    <div class="tab-content">${lines.map((line) => `<li>${line}</li>`).join('')}</div></body></html>`;
}

const URL = 'https://example.invalid/example-carbine/';

const CARBINE = productPage('Example Carbine, 300 HAM&#x27;R, 16&quot; Barrel, 1-15 Twist, Black', [
  'Caliber: 300 HAM&#x27;R',
  'Barrel Length: 16&quot; (Non-Fluted, Threaded)',
  'Overall Length: 33.25&quot;',
  'Weight Empty: 6 lbs 8 oz',
]);

const PISTOL = productPage('Example Compact, 9mm, Black', [
  'Caliber: 9mm',
  '3.6&quot; Carbon Steel slide',
  '3.6&quot; Stainless Steel match-grade cone barrel, hand fit',
  'Full-Length guide rod with reverse plug',
]);

function gunOf(markup: string) {
  const reading = readPage(markup, URL, '2026-11-02')[0];
  return reading !== undefined && 'firearm' in reading ? reading.firearm : undefined;
}

function reasonOf(markup: string): string | undefined {
  const reading = readPage(markup, URL, '2026-11-02')[0];
  return reading !== undefined && 'skipped' in reading ? reading.skipped : undefined;
}

describe("reading Wilson Combat's product pages", () => {
  it("reads a rifle's figures, the twist from its heading, every figure with the maker's own string", () => {
    const gun = gunOf(CARBINE)!;
    expect(gun.name).toBe(`Wilson Combat Example Carbine, 300 HAM'R, 16" Barrel, 1-15 Twist, Black`);
    expect(gun.cartridge).toBe("300 HAM'R");
    expect(gun.barrel.length).toBeCloseTo(16 * 0.0254, 9);
    expect(gun.barrel.twistLength).toBeCloseTo(15 * 0.0254, 9);
    // 6 lb 8 oz: 6.5 pounds.
    expect(gun.barrel.gunMass).toBeCloseTo(6.5 * 0.45359237, 6);
    expect(gun.source).toMatchObject({ massBasis: 'unstated', published: { barrelLength: '16" (Non-Fluted, Threaded)', twist: '1-15 Twist', weight: '6 lbs 8 oz' } });
  });

  it("finds a pistol's barrel in its build list, not its slide's equal length", () => {
    const gun = gunOf(PISTOL)!;
    expect(gun.barrel.length).toBeCloseTo(3.6 * 0.0254, 9);
    expect(gun.barrel.gunMass).toBeUndefined();
    expect(gun.source?.published?.barrelLength).toBe('3.6" Stainless Steel match-grade cone barrel, hand fit');
  });

  it('takes no barrel from a build list that names two', () => {
    expect(barrelLine(['4" match barrel', '5" match barrel'])).toBeUndefined();
    expect(barrelLine(['Bull barrel bushing', '4.25" barrel'])).toBe('4.25" barrel');
    expect(reasonOf(productPage('Two Barrels, 9mm', ['Caliber: 9mm', '4" barrel', '5" barrel']))).toBe('Two Barrels, 9mm: no barrel length');
  });

  it('skips a page without a single loadable cartridge', () => {
    expect(reasonOf(productPage('Rimfire Trainer', ['Caliber: 22 LR', 'Barrel Length: 16"']))).toBe('Rimfire Trainer: no single loadable cartridge (22 LR)');
    expect(reasonOf(productPage('Holster', ['Fits 1911']))).toBe('Holster: no single loadable cartridge (none printed)');
  });

  it('reads only the gun categories, and only the links the products sitemap names', () => {
    expect(
      gunCategories([
        'https://wilsoncombat.com/handguns/1911/sentinel/',
        'https://wilsoncombat.com/long-guns/ar-10/',
        'https://wilsoncombat.com/accessories/parts/rifles/barrels/243-winchester/',
      ]),
    ).toEqual(['https://wilsoncombat.com/handguns/1911/sentinel/', 'https://wilsoncombat.com/long-guns/ar-10/']);
    const category = `<a href="https://wilsoncombat.com/example-compact/">Compact</a>
      <a href="https://wilsoncombat.com/example-compact/">again</a>
      <a href="https://wilsoncombat.com/handguns/1911/">Category</a>
      <a href="https://wilsoncombat.com/example-compact/?color=black">Variant</a>`;
    expect(productLinks(category, new Set(['https://wilsoncombat.com/example-compact/']))).toEqual(['https://wilsoncombat.com/example-compact/']);
  });

  it("leaves out a page whose heading and specifications name different cartridges", () => {
    expect(headingAgrees("SBR Tactical, 300 HAM'R, 11.3\" Barrel", '300 Blackout')).toBe(false);
    expect(headingAgrees('Model 20, 8.6 Blackout, 16" Barrel', '.6 Blackout')).toBe(false);
    expect(headingAgrees('Ranger, .243 WIN, 16" Barrel', '.243 Winchester')).toBe(true);
    expect(headingAgrees('Protector, 5.56 NATO, 16" Barrel', '5.56mm NATO')).toBe(true);
    expect(reasonOf(productPage('Example Carbine, 300 HAM&#x27;R, 16&quot; Barrel', ['Caliber: 300 Blackout', 'Barrel Length: 16&quot;']))).toMatch(/does not name/);
  });

  it("leaves out the other makers' guns the shop sells", () => {
    expect(reasonOf(productPage('Guncrafter Industries, No Name, Government, 9mm', ['Caliber: 9mm', '5" barrel']))).toMatch(/another maker/);
  });

  it('takes the barrel from the heading when nothing else prints it', () => {
    expect(headingBarrel('NULA Model 20S, 350 Legend, 16" Barrel, 1-15 Twist')).toBe('16" Barrel');
    expect(gunOf(productPage('NULA Model 20S, 350 Legend, 16&quot; Barrel, 1-15 Twist', ['Caliber: 350 Legend']))!.barrel.length).toBeCloseTo(16 * 0.0254, 9);
  });

  it("keeps no weight that the page gives for another configuration of the range", () => {
    const gun = gunOf(productPage('NULA Model 20S, 300 Blackout, 16&quot; Barrel, 1-7 Twist', ['Caliber: 300 Blackout', 'Weight: 4 lb. 13 oz (350 Legend, 16&quot; barrel model, 13.5&quot; LOP)']))!;
    expect(gun.barrel.gunMass).toBeUndefined();
    expect(gun.source?.published?.['weight']).toBeUndefined();
  });
});
